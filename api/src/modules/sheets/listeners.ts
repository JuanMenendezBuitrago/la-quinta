import {
  internalEvents,
  INTERNAL_EVENTS,
  OrderClosedPayload,
  CustomerDeletedPayload,
  DELETED_CUSTOMER_NAME,
} from "../../config/events";
import { migrateSheetsExports, SheetsAnonymization, SheetsExport, SheetsExportKind } from "./model";
import { buildRow } from "./columns";
import { appendRows, ensureSheet, isSheetsConfigured, replaceInRows, sheetTab } from "./client";

const RETRY_INTERVAL_MS = 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Deja el pedido en la cola de exportacion de la pestaña de su estado. Devuelve false si ya
 * estaba (exportado o no), de modo que repetirlo nunca duplica filas en la hoja.
 */
export async function enqueueClosedOrder(payload: OrderClosedPayload, createdAt = new Date()) {
  const result = await SheetsExport.updateOne(
    { orderId: payload.orderId, kind: payload.status },
    // Se guardan los datos, no la fila: si cambian las columnas, lo pendiente sale con el formato nuevo.
    { $setOnInsert: { payload, createdAt } },
    { upsert: true }
  );
  return result.upsertedCount > 0;
}

let processing = false;

/** Envia a Google Sheets las filas pendientes cuyo reintento ya toca. */
async function processQueue() {
  if (processing || !isSheetsConfigured()) return;
  processing = true;
  try {
    // Cada pestaña por separado: si una falla, la otra sigue exportandose. Las anonimizaciones
    // van despues, en el mismo turno: asi nunca se cruzan con una fila que se esta añadiendo.
    for (const kind of ["ENTREGADO", "CANCELADO"] as const) await processKind(kind);
    await processAnonymizations();
  } finally {
    processing = false;
  }
}

async function processKind(kind: SheetsExportKind) {
  for (;;) {
    const batch = await SheetsExport.find({ kind, status: "PENDIENTE", nextAttemptAt: { $lte: new Date() } })
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (!batch.length) return;

    const ids = batch.map((j) => j._id);
    try {
      await appendRows(kind, batch.map((j) => buildRow(kind, j.payload)));
    } catch (err: any) {
      const attempts = Math.max(...batch.map((j) => j.attempts)) + 1;
      await SheetsExport.updateMany(
        { _id: { $in: ids } },
        {
          $inc: { attempts: 1 },
          $set: { lastError: String(err?.message ?? err), nextAttemptAt: backoffFrom(attempts) },
        }
      );
      console.error(
        `[sheets] no se pudieron exportar ${batch.length} pedidos a "${sheetTab(kind)}" (intento ${attempts}):`,
        err?.message ?? err
      );
      return;
    }

    await SheetsExport.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "EXPORTADO", exportedAt: new Date() }, $unset: { lastError: 1 } }
    );
    console.log(`[sheets] ${batch.length} pedidos exportados a "${sheetTab(kind)}"`);
  }
}

function backoffFrom(attempts: number) {
  return new Date(Date.now() + Math.min(RETRY_INTERVAL_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS));
}

/** Sustituye el nombre de los clientes que han suprimido su cuenta en las filas ya escritas. */
async function processAnonymizations() {
  const jobs = await SheetsAnonymization.find({ status: "PENDIENTE", nextAttemptAt: { $lte: new Date() } })
    .sort({ createdAt: 1 })
    .lean();
  for (const job of jobs) {
    try {
      let changed = 0;
      for (const kind of ["ENTREGADO", "CANCELADO"] as const) {
        changed += await replaceInRows(kind, "Código cliente", job.customerCode, "Cliente", DELETED_CUSTOMER_NAME);
      }
      await SheetsAnonymization.updateOne(
        { _id: job._id },
        { $set: { status: "EXPORTADO", doneAt: new Date() }, $unset: { lastError: 1 } }
      );
      console.log(`[sheets] cliente ${job.customerCode} anonimizado en la hoja (${changed} filas)`);
    } catch (err: any) {
      const attempts = job.attempts + 1;
      await SheetsAnonymization.updateOne(
        { _id: job._id },
        { $set: { attempts, lastError: String(err?.message ?? err), nextAttemptAt: backoffFrom(attempts) } }
      );
      console.error(`[sheets] no se pudo anonimizar al cliente ${job.customerCode} (intento ${attempts}):`, err?.message ?? err);
    }
  }
}

async function onCustomerDeleted(payload: CustomerDeletedPayload) {
  try {
    // Lo que aun no ha salido hacia la hoja sale ya anonimizado...
    await SheetsExport.updateMany(
      { status: "PENDIENTE", "payload.customerCode": payload.customerCode },
      { $set: { "payload.customerName": DELETED_CUSTOMER_NAME } }
    );
    // ...y lo que ya esta en la hoja se corrige (con reintentos si Google falla).
    await SheetsAnonymization.updateOne(
      { customerCode: payload.customerCode },
      { $set: { status: "PENDIENTE", attempts: 0, nextAttemptAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    await processQueue();
  } catch (err) {
    console.error("[sheets] error al anonimizar al cliente", payload.customerCode, err);
  }
}

async function onOrderClosed(payload: OrderClosedPayload) {
  try {
    await enqueueClosedOrder(payload);
    await processQueue();
  } catch (err) {
    console.error("[sheets] error al encolar el pedido", payload.orderId, err);
  }
}

/**
 * Suscripcion del modulo de exportacion a los eventos internos "pedido cerrado" y
 * "pedido cancelado". Se registra una vez al arrancar el servidor (ver src/index.ts).
 *
 * Los pedidos se encolan siempre, aunque la exportacion no este configurada todavia:
 * en cuanto se configure, las filas pendientes se envian en orden.
 */
export async function registerSheetsListeners() {
  await migrateSheetsExports();
  // Entregados: al cerrarse (en mesa y barra, ademas cobrados), asi la hoja solo recoge ventas pagadas.
  internalEvents.on(INTERNAL_EVENTS.ORDER_COMPLETED, onOrderClosed);
  internalEvents.on(INTERNAL_EVENTS.ORDER_CANCELLED, onOrderClosed);
  internalEvents.on(INTERNAL_EVENTS.CUSTOMER_DELETED, onCustomerDeleted);

  if (!isSheetsConfigured()) {
    console.log("[sheets] exportacion a Google Sheets desactivada (faltan variables GOOGLE_*); los pedidos quedan en cola");
    return;
  }

  Promise.all([ensureSheet("ENTREGADO"), ensureSheet("CANCELADO")])
    .then(() =>
      console.log(`[sheets] conectado a Google Sheets (pestañas "${sheetTab("ENTREGADO")}" y "${sheetTab("CANCELADO")}")`)
    )
    .catch((err) => console.error("[sheets] no se pudo acceder a la hoja de calculo:", err?.message ?? err));

  setInterval(() => {
    processQueue().catch((err) => console.error("[sheets] error procesando la cola", err));
  }, RETRY_INTERVAL_MS).unref();
  processQueue().catch((err) => console.error("[sheets] error procesando la cola", err));
}
