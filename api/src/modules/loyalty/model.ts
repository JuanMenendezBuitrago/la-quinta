import { Schema, model, Types } from "mongoose";

export type LoyaltyReason = "pedido" | "canje" | "ajuste";

export interface LoyaltyTransactionDoc {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  stamps: number; // positivo = ganados, negativo = canjeados
  reason: LoyaltyReason;
  orderId?: Types.ObjectId;
  createdAt: Date;
}

// Ledger de movimientos: nunca se edita ni se borra una fila, y el saldo
// siempre se deriva sumando el historico (ver loyalty/resolvers.ts). Es la
// unica forma de poder auditar un "me faltan sellos" sin adivinar que paso.
const loyaltyTransactionSchema = new Schema<LoyaltyTransactionDoc>({
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  stamps: { type: Number, required: true },
  reason: { type: String, enum: ["pedido", "canje", "ajuste"], required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  createdAt: { type: Date, default: () => new Date() },
});

export const LoyaltyTransaction = model<LoyaltyTransactionDoc>(
  "LoyaltyTransaction",
  loyaltyTransactionSchema
);

// Reglas del programa (fase 1). Documentadas como decision abierta en la
// propuesta de arquitectura: ajustar aqui cuando el negocio las cierre.
export const LOYALTY_RULES = {
  // Los precios de la carta estan en pesos colombianos (priceCents = pesos, sin decimales),
  // asi que este valor son pesos: 1 sello por cada $10.000 COP de pedido entregado.
  pesosPerStamp: 10000,
  rewardThresholdStamps: 10, // a partir de 10 sellos, hay recompensa disponible
};
