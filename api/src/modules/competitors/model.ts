import { Schema, model, Types } from "mongoose";

/**
 * Competencia: cafeterias con las que comparar precios. De cada una se guardan las fuentes de su
 * menu (enlaces a su web o archivos subidos: PDF o fotos de la carta) y los productos que Claude
 * leyo de ellas, cada uno emparejado (o no) con un producto de nuestra carta. El emparejamiento lo
 * propone Claude y lo confirma gestion; los confirmados se respetan al volver a leer el menu.
 * Importes en pesos, como el resto de campos "Cents".
 */

/** Ruta publica de los archivos de menu subidos (dentro del directorio de subidas). */
export const COMPETITOR_UPLOAD_PREFIX = "/uploads/competitors/";

export interface CompetitorSourceDoc {
  _id: Types.ObjectId;
  kind: "url" | "file";
  url?: string; // kind "url"
  filePath?: string; // kind "file": ruta /uploads/competitors/<uuid>.<ext>
  fileName?: string; // nombre original del archivo, para reconocerlo
  mimeType?: string;
  addedAt: Date;
}

export interface CompetitorItemDoc {
  _id: Types.ObjectId;
  name: string;
  size?: string; // "12 oz", "grande", "250 g"...
  category?: string;
  priceCents: number;
  menuItemId?: Types.ObjectId | null; // producto nuestro equivalente
  matchConfirmed: boolean; // gestion lo dio por bueno (o lo eligio a mano)
  manual: boolean; // añadido a mano: no se borra al volver a leer el menu
  previousPriceCents?: number; // precio de la lectura anterior, si cambio
  priceChangedAt?: Date;
}

export type CompetitorReadStatus = "idle" | "reading" | "error";

export interface CompetitorDoc {
  _id: Types.ObjectId;
  name: string;
  neighborhood?: string;
  notes?: string;
  sources: CompetitorSourceDoc[];
  items: CompetitorItemDoc[];
  readStatus: CompetitorReadStatus;
  readStartedAt?: Date;
  lastReadAt?: Date;
  lastReadError?: string;
  lastReadNote?: string; // aviso de Claude al leer (p. ej. "la foto se corta por abajo")
  lastReadByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<CompetitorSourceDoc>({
  kind: { type: String, enum: ["url", "file"], required: true },
  url: { type: String, trim: true, maxlength: 2000 },
  filePath: { type: String },
  fileName: { type: String, trim: true, maxlength: 200 },
  mimeType: { type: String },
  addedAt: { type: Date, default: () => new Date() },
});

const itemSchema = new Schema<CompetitorItemDoc>({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  size: { type: String, trim: true, maxlength: 40 },
  category: { type: String, trim: true, maxlength: 80 },
  priceCents: { type: Number, required: true, min: 0 },
  menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", default: null },
  matchConfirmed: { type: Boolean, default: false },
  manual: { type: Boolean, default: false },
  previousPriceCents: { type: Number },
  priceChangedAt: { type: Date },
});

const competitorSchema = new Schema<CompetitorDoc>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  neighborhood: { type: String, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 500 },
  sources: { type: [sourceSchema], default: [] },
  items: { type: [itemSchema], default: [] },
  readStatus: { type: String, enum: ["idle", "reading", "error"], default: "idle" },
  readStartedAt: { type: Date },
  lastReadAt: { type: Date },
  lastReadError: { type: String },
  lastReadNote: { type: String },
  lastReadByName: { type: String },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

export const Competitor = model<CompetitorDoc>("Competitor", competitorSchema);

export const MAX_SOURCES_PER_COMPETITOR = 6;
