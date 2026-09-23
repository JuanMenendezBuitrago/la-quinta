/**
 * Encola para Google Sheets los pedidos ENTREGADO y CANCELADO que todavia no se han exportado
 * (p. ej. los cerrados antes de activar la exportacion). Es idempotente: los pedidos que ya
 * estan en la cola o en la hoja se saltan, asi que se puede ejecutar varias veces.
 *
 * El envio lo hace la API en marcha (revisa la cola cada minuto), no este script.
 *
 * Uso: npm run export-sheets                              (desarrollo)
 *      docker compose exec api node dist/scripts/export-orders-to-sheets.js
 */
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { Order } from "../modules/orders/model";
import { buildClosedPayload } from "../modules/orders/closed";
import { migrateSheetsExports } from "../modules/sheets/model";
import { enqueueClosedOrder } from "../modules/sheets/listeners";

// Antes de corregir setOrderStatus, updatedAt no se actualizaba al cambiar de estado: si apenas
// difiere de createdAt, la fecha real de cierre no se conoce y la columna se deja vacia.
const MIN_CLOSE_GAP_MS = 1000;

async function exportClosedOrders() {
  await connectMongo();
  await migrateSheetsExports();

  for (const status of ["ENTREGADO", "CANCELADO"] as const) {
    const orders = await Order.find({ status }).sort({ updatedAt: 1 }).exec();
    let queued = 0;
    for (const order of orders) {
      const known = order.updatedAt.getTime() - order.createdAt.getTime() > MIN_CLOSE_GAP_MS;
      const closedAt = known ? order.updatedAt : null;
      const payload = await buildClosedPayload(order, status, closedAt);
      if (await enqueueClosedOrder(payload, closedAt ?? order.createdAt)) queued++;
    }
    console.log(`[export-sheets] ${status}: ${orders.length} pedidos, ${queued} nuevos en cola`);
  }

  await mongoose.disconnect();
}

exportClosedOrders().catch((err) => {
  console.error(err);
  process.exit(1);
});
