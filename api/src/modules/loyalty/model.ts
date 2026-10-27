import { Schema, model, Types } from "mongoose";

// foto: el sello por una foto de cliente aprobada (ver loyalty/redemption.ts, awardPhotoStamp).
export type LoyaltyReason = "pedido" | "canje" | "ajuste" | "foto";

export interface LoyaltyTransactionDoc {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  stamps: number; // positivo = ganados, negativo = canjeados
  reason: LoyaltyReason;
  orderId?: Types.ObjectId;
  // Movimientos hechos por el personal (ajustes y canjes en mostrador): quien y por que.
  staffId?: Types.ObjectId;
  note?: string;
  createdAt: Date;
}

// Ledger de movimientos: nunca se edita ni se borra una fila, y el saldo
// siempre se deriva sumando el historico (ver loyalty/resolvers.ts). Es la
// unica forma de poder auditar un "me faltan sellos" sin adivinar que paso.
const loyaltyTransactionSchema = new Schema<LoyaltyTransactionDoc>({
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  stamps: { type: Number, required: true },
  reason: { type: String, enum: ["pedido", "canje", "ajuste", "foto"], required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  note: { type: String, trim: true, maxlength: 200 },
  createdAt: { type: Date, default: () => new Date() },
});

export const LoyaltyTransaction = model<LoyaltyTransactionDoc>(
  "LoyaltyTransaction",
  loyaltyTransactionSchema
);

// Como se ganan los sellos con los pedidos y cuantos hacen falta para canjear se editan en
// Configuracion (settings: stampsMode..., rewardThresholdStamps). Cambiarlo solo afecta a los
// pedidos cerrados despues: los sellos ya ganados quedan en el ledger tal cual.
export const LOYALTY_RULES = {
  stampsPerApprovedPhoto: 1, // por foto de cliente aprobada (una vez por producto y pedido)
};
