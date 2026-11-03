import { Schema, model, Types } from "mongoose";

/**
 * Turno de trabajo de una persona del personal. Fecha y horas van en hora de la tienda, como texto
 * ("YYYY-MM-DD", "HH:mm"), igual que el horario de apertura: un turno de 7:00 es de 7:00 en Medellin
 * se mire desde donde se mire, sin conversiones de zona horaria. No cruza la medianoche (end > start).
 */
export interface ShiftDoc {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  date: string;
  start: string;
  end: string;
  note?: string;
  updatedByName: string; // quien lo creo o cambio por ultima vez (copia, como en Expense)
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<ShiftDoc>({
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true },
  date: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  note: { type: String, trim: true, maxlength: 80 },
  updatedByName: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});
shiftSchema.index({ date: 1, staffId: 1 });

export const Shift = model<ShiftDoc>("Shift", shiftSchema);
