import { Schema, model, Types } from "mongoose";

export type SupplyUnit = "g" | "ml" | "ud";
export type StockReason = "compra" | "consumo" | "merma" | "conteo" | "ajuste";

export interface SupplyDoc {
  _id: Types.ObjectId;
  name: string;
  // Nombre sin tildes ni mayusculas: evita "Leche entera" y "leche  Entera" duplicados.
  nameKey: string;
  unit: SupplyUnit; // unidad base: gramos, mililitros o unidades
  category: string;
  minStock: number; // al bajar a este nivel o menos, se avisa al personal
  active: boolean;
  // Cache del saldo: se actualiza con $inc al crear cada movimiento. La fuente de verdad es el
  // ledger (StockMovement); el script recalc-stock lo recalcula si alguna vez se desincroniza.
  stock: number;
  createdAt: Date;
}

const supplySchema = new Schema<SupplyDoc>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  nameKey: { type: String, required: true, unique: true },
  unit: { type: String, enum: ["g", "ml", "ud"], required: true },
  category: { type: String, trim: true, maxlength: 40, default: "" },
  minStock: { type: Number, required: true, min: 0, default: 0 },
  active: { type: Boolean, required: true, default: true },
  stock: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: () => new Date() },
});

export const Supply = model<SupplyDoc>("Supply", supplySchema);

export function supplyNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface StockMovementDoc {
  _id: Types.ObjectId;
  supplyId: Types.ObjectId;
  delta: number; // positivo = entra, negativo = sale
  reason: StockReason;
  orderId?: Types.ObjectId; // consumo: pedido entregado que lo gasto
  staffId?: Types.ObjectId; // quien lo registro (todo menos el consumo automatico)
  note?: string;
  countedQty?: number; // conteo: lo que se conto (delta = contado - teorico)
  createdAt: Date;
}

// Ledger como el de sellos (loyalty/model.ts): nunca se edita ni se borra una fila, asi que
// cualquier "por que dice que queda 1 kg" se puede reconstruir movimiento a movimiento.
const stockMovementSchema = new Schema<StockMovementDoc>({
  supplyId: { type: Schema.Types.ObjectId, ref: "Supply", required: true },
  delta: { type: Number, required: true },
  reason: { type: String, enum: ["compra", "consumo", "merma", "conteo", "ajuste"], required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  staffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  note: { type: String, trim: true, maxlength: 200 },
  countedQty: { type: Number },
  createdAt: { type: Date, default: () => new Date() },
});

stockMovementSchema.index({ supplyId: 1, createdAt: -1 });
// Idempotencia del descuento automatico: un pedido entregado descuenta cada insumo una sola vez,
// aunque el evento se procese dos veces.
stockMovementSchema.index(
  { orderId: 1, supplyId: 1 },
  { unique: true, partialFilterExpression: { reason: "consumo" } }
);

export const StockMovement = model<StockMovementDoc>("StockMovement", stockMovementSchema);

export interface RecipeLineDoc {
  supplyId: Types.ObjectId;
  qty: number; // en la unidad base del insumo, por unidad de producto
  onlyTakeaway: boolean; // vasos, tapas...: solo si el pedido es para llevar o recoger
}

export interface RecipeDoc {
  _id: Types.ObjectId;
  menuItemId: Types.ObjectId;
  lines: RecipeLineDoc[];
  updatedAt: Date;
}

// La receta vive en el modulo de inventario (y no dentro de MenuItem) para que la carta no
// dependa del inventario: un producto sin receta simplemente no descuenta nada.
const recipeSchema = new Schema<RecipeDoc>({
  menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true, unique: true },
  lines: {
    type: [
      new Schema<RecipeLineDoc>(
        {
          supplyId: { type: Schema.Types.ObjectId, ref: "Supply", required: true },
          qty: { type: Number, required: true, min: 0 },
          onlyTakeaway: { type: Boolean, required: true, default: false },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
  updatedAt: { type: Date, default: () => new Date() },
});

export const Recipe = model<RecipeDoc>("Recipe", recipeSchema);

export function isDuplicateKeyError(err: unknown) {
  return (err as { code?: number })?.code === 11000;
}
