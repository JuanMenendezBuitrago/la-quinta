import fs from "fs/promises";
import path from "path";
import { Schema, model, Types } from "mongoose";

/**
 * Gasto de operacion o salida de caja. Entra en el siguiente cierre de caja que se haga (que lo marca
 * con su closingId), sea cual sea su fecha: spentAt es la fecha de la factura, solo informativa.
 * Con closingId ya no se puede editar ni borrar.
 */
export type ExpenseMethod = "CAJA" | "TARJETA" | "TRANSFERENCIA" | "OTRO";
export const EXPENSE_METHODS: ExpenseMethod[] = ["CAJA", "TARJETA", "TRANSFERENCIA", "OTRO"];

export type ExpenseCategory = "INSUMOS" | "SERVICIOS" | "MANTENIMIENTO" | "PERSONAL" | "ALQUILER" | "OTROS";
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["INSUMOS", "SERVICIOS", "MANTENIMIENTO", "PERSONAL", "ALQUILER", "OTROS"];

export interface ExpenseDoc {
  _id: Types.ObjectId;
  amountCents: number;
  // CAJA: pagado con el efectivo del cajon (resta del arqueo). El resto solo cuenta para el resultado.
  method: ExpenseMethod;
  category: ExpenseCategory;
  description: string;
  supplier?: string;
  receiptUrl?: string; // /uploads/receipts/<uuid>.<ext>
  spentAt: Date;
  staffId: Types.ObjectId;
  staffName: string; // copia, como en CashClosing
  closingId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDoc>({
  amountCents: { type: Number, required: true, min: 1 },
  method: { type: String, enum: EXPENSE_METHODS, required: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  description: { type: String, required: true, trim: true, maxlength: 200 },
  supplier: { type: String, trim: true, maxlength: 80 },
  receiptUrl: { type: String },
  spentAt: { type: Date, required: true },
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true },
  staffName: { type: String, required: true },
  closingId: { type: Schema.Types.ObjectId, ref: "CashClosing", default: null, index: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

export const Expense = model<ExpenseDoc>("Expense", expenseSchema);

export const RECEIPT_UPLOAD_PREFIX = "/uploads/receipts/";
const RECEIPT_PATH = /^\/uploads\/receipts\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Solo rutas que haya generado POST /uploads/receipt (nada de URLs externas ni de otras carpetas). */
export function isReceiptPath(value: string) {
  return RECEIPT_PATH.test(value);
}

/** Borra la foto de un recibo que ya no se usa. Nunca lanza: un archivo huerfano no debe bloquear nada. */
export async function removeReceiptFile(receiptUrl: string | null | undefined, uploadDir: string) {
  if (!receiptUrl || !isReceiptPath(receiptUrl)) return;
  try {
    await fs.unlink(path.join(uploadDir, "receipts", path.basename(receiptUrl)));
  } catch {
    // ya no existia
  }
}
