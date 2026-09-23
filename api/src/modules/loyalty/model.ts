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

// Reglas del programa: la tarjeta de cafeteria clasica. Cada producto de un pedido entregado
// suma un sello (2 cafes = 2 sellos), sea cual sea su precio. Cambiar la regla solo afecta a
// los pedidos entregados despues: los sellos ya ganados quedan en el ledger tal cual.
export const LOYALTY_RULES = {
  stampsPerUnit: 1,
  rewardThresholdStamps: 10, // a partir de 10 sellos, hay recompensa disponible
};
