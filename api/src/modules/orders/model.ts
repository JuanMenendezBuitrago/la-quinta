import { randomInt } from "crypto";
import { Schema, model, Types } from "mongoose";

export type OrderStatus = "NUEVO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO";

/**
 * Desde que estados se puede llegar a cada uno. El flujo es lineal
 * (NUEVO -> EN_PREPARACION -> LISTO -> ENTREGADO), se puede cancelar mientras el pedido
 * este activo, y ENTREGADO y CANCELADO son finales: no se sale de ellos.
 */
export const ALLOWED_FROM: Record<OrderStatus, OrderStatus[]> = {
  NUEVO: [],
  EN_PREPARACION: ["NUEVO"],
  LISTO: ["EN_PREPARACION"],
  ENTREGADO: ["LISTO"],
  CANCELADO: ["NUEVO", "EN_PREPARACION", "LISTO"],
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  NUEVO: "nuevo",
  EN_PREPARACION: "en preparacion",
  LISTO: "listo",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
};

/** Personalizacion elegida (snapshot, como el nombre y el precio del producto). */
export interface OrderLineOptionDoc {
  groupId: Types.ObjectId;
  groupName: string;
  optionId: Types.ObjectId;
  name: string;
  priceDeltaCents: number;
  // La que lleva el producto por defecto: en la cola solo se destacan las que no lo son.
  isDefault: boolean;
  // La opcion por defecto del grupo en ese producto (la de su receta): el inventario la cambia
  // por la elegida. Vacio en pedidos anteriores a este campo o si el grupo no tiene defecto.
  defaultOptionId?: Types.ObjectId | null;
}

export interface OrderLineDoc {
  menuItemId: Types.ObjectId;
  name: string; // snapshot: si el precio de la carta cambia despues, el pedido no se altera
  priceCents: number; // precio por unidad, suplementos de las opciones incluidos
  quantity: number;
  options: OrderLineOptionDoc[];
}

export type OrderSource = "WEB" | "STAFF";
export type ServiceType = "MESA" | "LLEVAR";
export type PaymentMethod = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";
export const PAYMENT_METHODS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

/**
 * Cobro: en mesa y barra (serviceType MESA) se sirve y se cobra por separado, en cualquier orden,
 * y el pedido solo se cierra (completedAt) cuando esta entregado Y cobrado. En los pedidos web y
 * para llevar se entrega y se cobra a la vez, asi que se cierran al entregar.
 */
/** Valor de `table` para la barra: se sirve como en mesa, pero sin numero. */
export const BAR_TABLE = "Barra";
/** Donde puede sentarse un cliente que pide desde el local: las 6 mesas y la barra. */
export const CUSTOMER_TABLES = ["1", "2", "3", "4", "5", "6", BAR_TABLE];

export function requiresPayment(order: Pick<OrderDoc, "serviceType">) {
  return order.serviceType === "MESA";
}

/** Un cambio de estado: cuando y, si lo hizo el personal, quien (el NUEVO de un pedido web no lo tiene). */
export interface OrderStatusChangeDoc {
  status: OrderStatus;
  at: Date;
  staffId?: Types.ObjectId;
}

export interface OrderDoc {
  _id: Types.ObjectId;
  code: string; // codigo corto y unico para identificar el pedido en el mostrador
  // Sin cliente: pedido tomado por el personal a alguien sin cuenta (se puede asignar despues).
  customerId?: Types.ObjectId | null;
  source: OrderSource;
  // En mesa (con su numero, o "Barra") o para llevar. Sin valor: pedido web para recoger.
  serviceType?: ServiceType;
  table?: string;
  note?: string;
  createdByStaffId?: Types.ObjectId;
  items: OrderLineDoc[];
  totalCents: number;
  pickupSlot: Date;
  status: OrderStatus;
  // Todos los cambios de estado en orden, empezando por el NUEVO de la creacion.
  statusHistory: OrderStatusChangeDoc[];
  deliveredAt?: Date;
  paidAt?: Date;
  paymentMethod?: PaymentMethod;
  paidByStaffId?: Types.ObjectId;
  // Cierre: entregado y, si es de mesa, cobrado. Es lo que suma sellos y escribe la fila en la hoja.
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderLineOptionSchema = new Schema<OrderLineOptionDoc>(
  {
    groupId: { type: Schema.Types.ObjectId, required: true },
    groupName: { type: String, required: true },
    optionId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    priceDeltaCents: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, required: true },
    defaultOptionId: { type: Schema.Types.ObjectId },
  },
  { _id: false }
);

const orderStatusChangeSchema = new Schema<OrderStatusChangeDoc>(
  {
    status: { type: String, enum: ["NUEVO", "EN_PREPARACION", "LISTO", "ENTREGADO", "CANCELADO"], required: true },
    at: { type: Date, required: true },
    staffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  },
  { _id: false }
);

const orderLineSchema = new Schema<OrderLineDoc>(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    priceCents: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    options: { type: [orderLineOptionSchema], default: [] },
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDoc>({
  // sparse: los pedidos anteriores a este campo no lo tienen hasta que corre backfillOrderCodes
  code: { type: String, unique: true, sparse: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User" },
  source: { type: String, enum: ["WEB", "STAFF"], default: "WEB" },
  serviceType: { type: String, enum: ["MESA", "LLEVAR"] },
  table: { type: String, trim: true, maxlength: 20 },
  note: { type: String, trim: true, maxlength: 200 },
  createdByStaffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  items: { type: [orderLineSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
  totalCents: { type: Number, required: true, min: 0 },
  pickupSlot: { type: Date, required: true },
  status: {
    type: String,
    enum: ["NUEVO", "EN_PREPARACION", "LISTO", "ENTREGADO", "CANCELADO"],
    default: "NUEVO",
  },
  statusHistory: { type: [orderStatusChangeSchema], default: [] },
  deliveredAt: { type: Date },
  paidAt: { type: Date },
  paymentMethod: { type: String, enum: PAYMENT_METHODS },
  paidByStaffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  completedAt: { type: Date },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

// Historial de un cliente (Mis pedidos, ficha de cliente en el panel).
orderSchema.index({ customerId: 1, createdAt: -1 });

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

/**
 * Los pedidos entregados antes de que existiera el cobro se dan por cerrados (y su entrega, en
 * updatedAt): asi no aparecen de golpe como "por cobrar" en la cola. Idempotente.
 */
export async function backfillCompletedOrders() {
  const result = await Order.updateMany({ status: "ENTREGADO", completedAt: { $exists: false } }, [
    { $set: { completedAt: "$updatedAt", deliveredAt: { $ifNull: ["$deliveredAt", "$updatedAt"] } } },
  ]);
  if (result.modifiedCount) console.log(`[orders] ${result.modifiedCount} pedidos entregados marcados como cerrados`);
}

/**
 * Historial para los pedidos anteriores a statusHistory, con lo unico que se sabe de ellos: la
 * creacion, la entrega (deliveredAt) y la cancelacion (su ultimo cambio, updatedAt). Los pasos
 * intermedios (en preparacion, listo) no se guardaban y quedan fuera. Idempotente.
 */
export async function backfillStatusHistory() {
  const result = await Order.updateMany({ statusHistory: { $exists: false } }, [
    {
      $set: {
        statusHistory: {
          $concatArrays: [
            [{ status: "NUEVO", at: "$createdAt", staffId: "$createdByStaffId" }],
            {
              $switch: {
                branches: [
                  { case: { $eq: ["$status", "ENTREGADO"] }, then: [{ status: "ENTREGADO", at: { $ifNull: ["$deliveredAt", "$updatedAt"] } }] },
                  { case: { $eq: ["$status", "CANCELADO"] }, then: [{ status: "CANCELADO", at: "$updatedAt" }] },
                ],
                default: [],
              },
            },
          ],
        },
      },
    },
  ]);
  if (result.modifiedCount) console.log(`[orders] historial de estados reconstruido en ${result.modifiedCount} pedidos`);
}
