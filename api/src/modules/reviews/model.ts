import { Schema, model, Types } from "mongoose";

/**
 * Opinion de un cliente: sobre un pedido entregado (orderId) o sobre el local en general
 * (sin orderId). Solo la lee el local (seccion "Opiniones", rol gestion); no se publica.
 */
export interface ReviewDoc {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  rating: number; // 1 a 5 estrellas
  // Se borra al suprimir la cuenta (puede contener datos personales); la puntuacion se conserva.
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const REVIEW_COMMENT_MAX = 1000;

const reviewSchema = new Schema<ReviewDoc>({
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: REVIEW_COMMENT_MAX },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

// Una por pedido y una general por cliente (orderId null cuenta como un valor mas en el indice).
reviewSchema.index({ customerId: 1, orderId: 1 }, { unique: true });
reviewSchema.index({ updatedAt: -1 });

export const Review = model<ReviewDoc>("Review", reviewSchema);
