import { randomInt } from "crypto";
import { Schema, model, Types } from "mongoose";

export type OrderStatus = "NUEVO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO";

export interface OrderLineDoc {
  menuItemId: Types.ObjectId;
  name: string; // snapshot: si el precio de la carta cambia despues, el pedido no se altera
  priceCents: number;
  quantity: number;
}

export interface OrderDoc {
  _id: Types.ObjectId;
  code: string; // codigo corto y unico para identificar el pedido en el mostrador
  customerId: Types.ObjectId;
  items: OrderLineDoc[];
  totalCents: number;
  pickupSlot: Date;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const orderLineSchema = new Schema<OrderLineDoc>(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    priceCents: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDoc>({
  // sparse: los pedidos anteriores a este campo no lo tienen hasta que corre backfillOrderCodes
  code: { type: String, unique: true, sparse: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  items: { type: [orderLineSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
  totalCents: { type: Number, required: true, min: 0 },
  pickupSlot: { type: Date, required: true },
  status: {
    type: String,
    enum: ["NUEVO", "EN_PREPARACION", "LISTO", "ENTREGADO", "CANCELADO"],
    default: "NUEVO",
  },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

orderSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Order = model<OrderDoc>("Order", orderSchema);

// Sin 0/O ni 1/I/L para que se pueda dictar y leer sin confusiones.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export function generateOrderCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `P-${code}`;
}

export function isDuplicateCodeError(err: any) {
  return err?.code === 11000 && !!err?.keyPattern?.code;
}

/** Asigna codigo a los pedidos creados antes de que existiera el campo. Idempotente. */
export async function backfillOrderCodes() {
  const pending = await Order.find({ code: { $exists: false } }).select("_id").lean();
  for (const { _id } of pending) {
    for (;;) {
      try {
        await Order.updateOne({ _id, code: { $exists: false } }, { $set: { code: generateOrderCode() } });
        break;
      } catch (err) {
        if (!isDuplicateCodeError(err)) throw err;
      }
    }
  }
  if (pending.length) console.log(`[orders] codigo asignado a ${pending.length} pedidos existentes`);
}
