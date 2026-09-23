import { env } from "../../config/env";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { HeroSlide, HeroTone } from "./model";

interface HeroSlideInput {
  tag: string;
  title: string;
  text?: string | null;
  tone: HeroTone;
  linkUrl?: string | null;
  linkLabel?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
}

// "2026-09-23": en-CA formatea las fechas como YYYY-MM-DD.
const storeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: env.storeTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function storeToday() {
  return storeDateFormatter.format(new Date());
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Normaliza y valida lo que envia Gestion. Los enlaces solo pueden ser https://, http:// o rutas
 * de la propia web: un "javascript:" en la portada publica seria un XSS.
 */
function clean(input: HeroSlideInput) {
  const tag = input.tag.trim();
  const title = input.title.trim();
  if (!tag) throw new Error("Indica la etiqueta (p. ej. Oferta, Evento, Novedad)");
  if (!title) throw new Error("Indica el titulo");

  const linkUrl = input.linkUrl?.trim() || undefined;
  if (linkUrl && !/^https?:\/\/[^\s]+$/i.test(linkUrl) && !/^\/(?!\/)[^\s]*$/.test(linkUrl)) {
    throw new Error("El enlace debe empezar por https:// o ser una ruta de la web como /cuenta");
  }
  const linkLabel = input.linkLabel?.trim() || undefined;
  if (linkUrl && !linkLabel) throw new Error("Indica el texto del enlace (p. ej. Reservar plaza)");

  const startDate = input.startDate?.trim() || undefined;
  const endDate = input.endDate?.trim() || undefined;
  if (startDate && !isValidDate(startDate)) throw new Error("La fecha de inicio no es valida");
  if (endDate && !isValidDate(endDate)) throw new Error("La fecha de fin no es valida");
  if (startDate && endDate && endDate < startDate) throw new Error("La fecha de fin es anterior a la de inicio");

  return {
    tag,
    title,
    text: input.text?.trim() || undefined,
    tone: input.tone,
    linkUrl,
    linkLabel: linkUrl ? linkLabel : undefined,
    startDate,
    endDate,
    active: input.active,
  };
}

/** Campos opcionales que se vacian con $unset (con $set: undefined mongoose no los borra). */
function toUpdate(data: ReturnType<typeof clean>) {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) $unset[key] = 1;
    else $set[key] = value;
  }
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}

function sortedSlides() {
  return HeroSlide.find().sort({ position: 1, createdAt: 1 }).exec();
}

export const heroResolvers = {
  Query: {
    heroSlides: async () => {
      const today = storeToday();
      return HeroSlide.find({
        active: true,
        $and: [
          { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: today } }] },
          { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: today } }] },
        ],
      })
        .sort({ position: 1, createdAt: 1 })
        .exec();
    },
    allHeroSlides: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return sortedSlides();
    },
  },
  HeroSlide: {
    id: (doc: any) => doc._id.toString(),
  },
  Mutation: {
    createHeroSlide: async (_: unknown, args: { input: HeroSlideInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const last = await HeroSlide.findOne().sort({ position: -1 }).select("position").lean();
      return HeroSlide.create({ ...clean(args.input), position: (last?.position ?? -1) + 1 });
    },
    updateHeroSlide: async (_: unknown, args: { id: string; input: HeroSlideInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const slide = await HeroSlide.findByIdAndUpdate(args.id, toUpdate(clean(args.input)), {
        new: true,
        runValidators: true,
      });
      if (!slide) throw new Error("Diapositiva no encontrada");
      return slide;
    },
    deleteHeroSlide: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const deleted = await HeroSlide.findByIdAndDelete(args.id);
      if (!deleted) throw new Error("Diapositiva no encontrada");
      return true;
    },
    moveHeroSlide: async (_: unknown, args: { id: string; direction: "UP" | "DOWN" }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      // Se renumeran todas (0, 1, 2...) para que posiciones repetidas o con huecos no den saltos raros.
      const slides = await sortedSlides();
      const i = slides.findIndex((s) => s._id.toString() === args.id);
      if (i < 0) throw new Error("Diapositiva no encontrada");
      const j = args.direction === "UP" ? i - 1 : i + 1;
      if (j >= 0 && j < slides.length) [slides[i], slides[j]] = [slides[j], slides[i]];
      await HeroSlide.bulkWrite(
        slides.map((s, position) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { position } } } }))
      );
      return sortedSlides();
    },
  },
};
