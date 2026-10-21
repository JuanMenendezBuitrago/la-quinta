import { Schema, model, Types } from "mongoose";

/**
 * Cierre de caja: lo cobrado desde el cierre anterior (periodStart) hasta este (periodEnd),
 * repartido por metodo de pago, y el arqueo del efectivo (fondo inicial + contado).
 * Las cifras se guardan tal cual se calcularon: un pedido modificado despues no cambia un cierre.
 */
export interface CashClosingDoc {
  _id: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  staffId: Types.ObjectId;
  staffName: string; // copia: el cierre se sigue leyendo aunque la cuenta cambie de nombre
  ordersCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  // Pedidos para llevar o web entregados antes de que se pidiera el metodo de pago al entregar.
  unknownMethodCents: number;
  // Gastos que entraron en este cierre (ver modules/expenses). Solo los de CAJA salen del cajon.
  expensesCount: number;
  expensesCashCents: number;
  expensesOtherCents: number; // todos los que no son de CAJA (suma de los tres siguientes)
  expensesCardCents: number;
  expensesTransferCents: number;
  expensesOtherMethodCents: number; // metodo OTRO
  openingFloatCents: number;
  countedCashCents: number;
  // contado - (fondo + efectivo cobrado - gastos de caja): negativo = falta dinero, positivo = sobra.
  differenceCents: number;
  note?: string;
  createdAt: Date;
}

const cashClosingSchema = new Schema<CashClosingDoc>({
  // unique: dos cierres a la vez parten del mismo periodStart y solo uno se guarda.
  periodStart: { type: Date, required: true, unique: true },
  periodEnd: { type: Date, required: true },
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true },
  staffName: { type: String, required: true },
  ordersCount: { type: Number, required: true },
  totalCents: { type: Number, required: true },
  cashCents: { type: Number, required: true },
  cardCents: { type: Number, required: true },
  transferCents: { type: Number, required: true },
  unknownMethodCents: { type: Number, required: true },
  // Cierres anteriores a los gastos no los tienen: cuentan como 0.
  expensesCount: { type: Number, default: 0 },
  expensesCashCents: { type: Number, default: 0 },
  expensesOtherCents: { type: Number, default: 0 },
  expensesCardCents: { type: Number, default: 0 },
  expensesTransferCents: { type: Number, default: 0 },
  expensesOtherMethodCents: { type: Number, default: 0 },
  openingFloatCents: { type: Number, required: true, min: 0 },
  countedCashCents: { type: Number, required: true, min: 0 },
  differenceCents: { type: Number, required: true },
  note: { type: String, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: () => new Date() },
});

cashClosingSchema.index({ periodEnd: -1 });

export const CashClosing = model<CashClosingDoc>("CashClosing", cashClosingSchema);
