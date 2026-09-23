import { Schema, model, Types } from "mongoose";
import type { OrderClosedPayload } from "../../config/events";

export type SheetsExportStatus = "PENDIENTE" | "EXPORTADO";

export type SheetsCell = string | number;

/** A que pestaña va la fila: cada estado final tiene la suya (ver client.ts). */
export type SheetsExportKind = "ENTREGADO" | "CANCELADO";

export interface SheetsExportDoc {
  _id: Types.ObjectId;
  orderId: string;
  kind: SheetsExportKind;
  payload: OrderClosedPayload;
  status: SheetsExportStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt: Date;
  exportedAt?: Date;
  createdAt: Date;
}

// Cola persistente de filas por enviar: si Google no responde (o la exportacion aun no esta
// configurada), la fila espera aqui y se reintenta, en vez de perderse.
const sheetsExportSchema = new Schema<SheetsExportDoc>({
  orderId: { type: String, required: true },
  kind: { type: String, enum: ["ENTREGADO", "CANCELADO"], required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["PENDIENTE", "EXPORTADO"], default: "PENDIENTE" },
  attempts: { type: Number, default: 0 },
  lastError: { type: String },
  nextAttemptAt: { type: Date, default: () => new Date() },
  exportedAt: { type: Date },
  createdAt: { type: Date, default: () => new Date() },
});

// Unico por pedido y pestaña: aunque un pedido se marque "entregado" dos veces, solo sale una fila.
sheetsExportSchema.index({ orderId: 1, kind: 1 }, { unique: true });
sheetsExportSchema.index({ status: 1, nextAttemptAt: 1 });

export const SheetsExport = model<SheetsExportDoc>("SheetsExport", sheetsExportSchema);

/**
 * Las filas encoladas antes de exportar cancelados no tienen `kind` y el indice unico era solo
 * por orderId: se completan y se sustituye el indice. Idempotente.
 */
export async function migrateSheetsExports() {
  await SheetsExport.updateMany({ kind: { $exists: false } }, { $set: { kind: "ENTREGADO" } });
  await SheetsExport.syncIndexes();
}
