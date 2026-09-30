import { Schema, model, Types } from "mongoose";

export type RoastLevel = "CLARO" | "MEDIO" | "OSCURO";
export const ROAST_LEVELS: RoastLevel[] = ["CLARO", "MEDIO", "OSCURO"];

/**
 * Tamano de bolsa a la venta. El precio y la disponibilidad viven en su producto de la carta
 * (MenuItem), que es lo que se pide, se cobra y sale en la cola; el stock, en su insumo (bolsas,
 * en unidades). Ambos los crea y mantiene coffee/sync.ts: nunca se enlazan a mano.
 */
export interface CoffeePresentationDoc {
  grams: number;
  // Si este tamano se vende. Su producto sale en la carta si ademas el cafe esta disponible:
  // se guarda aparte para no perderlo al ocultar y volver a mostrar el cafe entero.
  available: boolean;
  menuItemId: Types.ObjectId;
  supplyId: Types.ObjectId;
}

/**
 * Cafe tostado en grano que se vende en bolsas (250 g, 500 g...). Es la ficha del cafe; cada
 * tamano es un producto de la carta, en la categoria "Cafe en grano". Aparte del "Cafe en grano"
 * que gastan las bebidas: el stock de bolsas se cuenta por unidades.
 */
export interface CoffeeDoc {
  _id: Types.ObjectId;
  name: string; // "Huila": los productos se llaman "Cafe Huila 250 g"
  origin?: string; // region o finca
  variety?: string; // caturra, castillo, geisha...
  processId?: Types.ObjectId | null; // lavado, honey, natural... (tabla CoffeeProcess)
  altitudeMasl?: number;
  roastLevel?: RoastLevel;
  tastingNotes: string[];
  description?: string;
  imageUrl?: string;
  // Sin disponible, sus productos no salen en la carta aunque cada tamano lo este.
  available: boolean;
  presentations: CoffeePresentationDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const presentationSchema = new Schema<CoffeePresentationDoc>(
  {
    grams: { type: Number, required: true, min: 1 },
    available: { type: Boolean, required: true, default: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    supplyId: { type: Schema.Types.ObjectId, ref: "Supply", required: true },
  },
  { _id: false }
);

const coffeeSchema = new Schema<CoffeeDoc>({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  origin: { type: String, trim: true, maxlength: 80 },
  variety: { type: String, trim: true, maxlength: 60 },
  processId: { type: Schema.Types.ObjectId, ref: "CoffeeProcess" },
  altitudeMasl: { type: Number, min: 0, max: 5000 },
  roastLevel: { type: String, enum: ROAST_LEVELS },
  tastingNotes: { type: [String], default: [] },
  description: { type: String, trim: true, maxlength: 400 },
  imageUrl: { type: String },
  available: { type: Boolean, required: true, default: true },
  presentations: { type: [presentationSchema], default: [] },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

// Dos cafes con el mismo nombre darian productos e insumos con el mismo nombre.
coffeeSchema.index({ name: 1 }, { unique: true, collation: { locale: "es", strength: 1 } });
// De un producto de la carta a su cafe (p. ej. para mostrar la ficha en la vista del producto).
coffeeSchema.index({ "presentations.menuItemId": 1 });

coffeeSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Coffee = model<CoffeeDoc>("Coffee", coffeeSchema);

/**
 * Procesos de beneficio (lavado, honey, natural...): el cafe elige uno de esta tabla en lugar de
 * escribirlo, para que no haya "Lavado", "lavado" y "Lavada" como procesos distintos.
 */
export interface CoffeeProcessDoc {
  _id: Types.ObjectId;
  name: string;
}

const coffeeProcessSchema = new Schema<CoffeeProcessDoc>({
  name: { type: String, required: true, trim: true, maxlength: 40 },
});
// Sin repetir aunque cambien tildes o mayusculas, como el nombre del cafe.
coffeeProcessSchema.index({ name: 1 }, { unique: true, collation: { locale: "es", strength: 1 } });

export const CoffeeProcess = model<CoffeeProcessDoc>("CoffeeProcess", coffeeProcessSchema);

const INITIAL_PROCESSES = ["Lavado", "Honey", "Natural"];
const NAME_COLLATION = { locale: "es", strength: 1 } as const;

/**
 * Al arrancar: crea los procesos iniciales (una sola vez: si luego se borra alguno, no vuelve) y
 * pasa los cafes que aun tienen el proceso como texto libre (campo `process`) a su proceso de la
 * tabla, creandolo si no existe. Idempotente.
 */
export async function ensureCoffeeProcesses() {
  const db = Coffee.db.db;
  if (!db) return;
  const marker = await db
    .collection("migrations")
    .updateOne({ name: "coffee-processes-initial" }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
  if (marker.upsertedCount) {
    for (const name of INITIAL_PROCESSES) {
      if (!(await CoffeeProcess.exists({ name }).collation(NAME_COLLATION))) await CoffeeProcess.create({ name });
    }
  }

  const legacy = await Coffee.collection.find({ process: { $exists: true } }).toArray();
  for (const coffee of legacy) {
    const text = typeof coffee.process === "string" ? coffee.process.trim().replace(/\s+/g, " ") : "";
    let processId: Types.ObjectId | null = null;
    if (text) {
      const found = await CoffeeProcess.findOne({ name: text }).collation(NAME_COLLATION).lean();
      processId = found?._id ?? (await CoffeeProcess.create({ name: text.slice(0, 40) }))._id;
    }
    await Coffee.collection.updateOne(
      { _id: coffee._id },
      { $unset: { process: "" }, ...(processId ? { $set: { processId } } : {}) }
    );
  }
  if (legacy.length) console.log(`[coffee] proceso de ${legacy.length} cafes pasado a la tabla de procesos`);
}
