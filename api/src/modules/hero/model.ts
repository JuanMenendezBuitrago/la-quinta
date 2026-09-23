import { Schema, model, Types } from "mongoose";

export type HeroTone = "teal" | "brown" | "olive";

export interface HeroSlideDoc {
  _id: Types.ObjectId;
  tag: string; // "Oferta", "Evento", "Novedad"...
  title: string;
  text?: string;
  tone: HeroTone; // uno de los colores del diseño (ver HeroSlideCard.vue)
  linkUrl?: string;
  linkLabel?: string;
  // Dias de vigencia en el calendario de la tienda ("YYYY-MM-DD", ambos incluidos). Sin ellos,
  // la diapositiva se muestra siempre que este activa.
  startDate?: string;
  endDate?: string;
  active: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const heroSlideSchema = new Schema<HeroSlideDoc>({
  tag: { type: String, required: true, trim: true, maxlength: 24 },
  title: { type: String, required: true, trim: true, maxlength: 70 },
  text: { type: String, trim: true, maxlength: 160 },
  tone: { type: String, enum: ["teal", "brown", "olive"], default: "teal" },
  linkUrl: { type: String, trim: true, maxlength: 500 },
  linkLabel: { type: String, trim: true, maxlength: 30 },
  startDate: { type: String, match: DATE_PATTERN },
  endDate: { type: String, match: DATE_PATTERN },
  active: { type: Boolean, default: true },
  position: { type: Number, default: 0, index: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

export const HeroSlide = model<HeroSlideDoc>("HeroSlide", heroSlideSchema);

// Las que llevaba la portada escritas en el codigo, para que activar la seccion no la deje vacia.
const INITIAL_SLIDES: Partial<HeroSlideDoc>[] = [
  { tag: "Oferta", title: "2x1 en cafés de filtro", text: "Todos los martes de 8:00 a 11:00.", tone: "teal" },
  { tag: "Novedad", title: "Nuevo café de origen Huila", text: "Notas a panela, cítricos y chocolate.", tone: "brown" },
  { tag: "Noticia", title: "Taller de cata este sábado", text: "Aprende a distinguir aromas y sabores. Plazas limitadas.", tone: "olive" },
  { tag: "Fidelización", title: "Suma sellos con cada pedido", text: "Al décimo café, el siguiente es cortesía de la casa.", tone: "teal" },
];

/**
 * Crea las diapositivas iniciales una sola vez en la vida de la base de datos. Queda una marca en
 * "migrations": si Gestion las borra todas, no reaparecen al reiniciar. (No sirve mirar si la
 * coleccion existe: mongoose la crea al preparar los indices, antes de que esto se ejecute.)
 */
export async function seedHeroSlidesOnce() {
  const db = HeroSlide.db.db;
  if (!db) return;
  const marker = await db
    .collection("migrations")
    .updateOne({ name: "hero-initial-slides" }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
  if (!marker.upsertedCount) return;
  if (await HeroSlide.exists({})) return;
  await HeroSlide.insertMany(INITIAL_SLIDES.map((s, i) => ({ ...s, position: i })));
  console.log(`[hero] creadas ${INITIAL_SLIDES.length} diapositivas iniciales de la portada`);
}
