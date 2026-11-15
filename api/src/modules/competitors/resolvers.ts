import fs from "fs/promises";
import path from "path";
import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { MenuCategory, MenuItem } from "../menu/model";
import { StaffUser } from "../users/model";
import { UPLOAD_DIR } from "../uploads/router";
import { aiEnabled, extractMenu, mergeItems } from "./extract";
import { Competitor, COMPETITOR_UPLOAD_PREFIX, CompetitorDoc, MAX_SOURCES_PER_COMPETITOR } from "./model";

// Una lectura que lleva mas que esto "leyendo" se dio por perdida (la API se reinicio a medias).
const STALE_READ_MS = 10 * 60_000;

const gestion = (ctx: GraphQLContext) => requireStaff(ctx, ["gestion"]);

async function actorName(ctx: GraphQLContext) {
  const member = await StaffUser.findById(ctx.staff!.id).select("name").lean();
  return member?.name ?? "Personal";
}

async function find(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Cafetería no encontrada");
  const doc = await Competitor.findById(id);
  if (!doc) throw new Error("Cafetería no encontrada");
  return doc;
}

const trimOrUndefined = (v?: string | null, max = 120) => v?.trim().slice(0, max) || undefined;

function cleanItemInput(input: { name: string; size?: string | null; priceCents: number; menuItemId?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("El producto necesita un nombre");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 100 || input.priceCents > 10_000_000) {
    throw new Error("Escribe el precio en pesos, sin decimales");
  }
  if (input.menuItemId && !Types.ObjectId.isValid(input.menuItemId)) throw new Error("Producto de la carta no válido");
  return {
    name: name.slice(0, 160),
    size: trimOrUndefined(input.size, 40),
    priceCents: input.priceCents,
    menuItemId: input.menuItemId ? new Types.ObjectId(input.menuItemId) : null,
  };
}

async function removeFile(filePath?: string) {
  if (!filePath?.startsWith(COMPETITOR_UPLOAD_PREFIX)) return;
  await fs.rm(path.join(UPLOAD_DIR, "competitors", path.basename(filePath)), { force: true });
}

/** Lee el menu en segundo plano y guarda el resultado (o el error) en la cafeteria. */
async function runRead(id: Types.ObjectId, byName: string) {
  try {
    const doc = await Competitor.findById(id).lean();
    if (!doc) return;
    const { items, notes } = await extractMenu(doc);
    const fresh = await Competitor.findById(id);
    if (!fresh) return;
    fresh.set({
      items: mergeItems(fresh.items, items),
      readStatus: "idle",
      lastReadAt: new Date(),
      lastReadError: undefined,
      lastReadNote: notes ?? undefined,
      lastReadByName: byName,
      updatedAt: new Date(),
    });
    await fresh.save();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo leer el menú";
    console.error(`[competencia] lectura fallida (${id.toString()}):`, err);
    await Competitor.updateOne({ _id: id }, { readStatus: "error", lastReadError: message.slice(0, 400), updatedAt: new Date() });
  }
}

export const competitorsResolvers = {
  Query: {
    competitors: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      gestion(ctx);
      return Competitor.find().sort({ name: 1 }).exec();
    },
    competitorAiEnabled: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      gestion(ctx);
      return aiEnabled();
    },
    priceComparison: async (_: unknown, args: { includeUnconfirmed?: boolean | null }, ctx: GraphQLContext) => {
      gestion(ctx);
      const includeUnconfirmed = args.includeUnconfirmed !== false;
      const [competitors, menuItems, categories] = await Promise.all([
        Competitor.find().select("name items").lean(),
        MenuItem.find().select("name priceCents categoryId").lean(),
        MenuCategory.find().select("name order").lean(),
      ]);
      const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
      const rows = new Map<string, { entries: any[] }>();
      for (const c of competitors) {
        for (const item of c.items) {
          if (!item.menuItemId || (!item.matchConfirmed && !includeUnconfirmed)) continue;
          const key = item.menuItemId.toString();
          if (!rows.has(key)) rows.set(key, { entries: [] });
          rows.get(key)!.entries.push({
            competitorId: c._id.toString(),
            competitorName: c.name,
            itemName: item.name,
            size: item.size ?? null,
            priceCents: item.priceCents,
            confirmed: item.matchConfirmed,
          });
        }
      }
      return menuItems
        .filter((m) => rows.has(m._id.toString()))
        .map((m) => {
          const entries = rows.get(m._id.toString())!.entries.sort((a, b) => a.priceCents - b.priceCents);
          const prices = entries.map((e) => e.priceCents);
          const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
          const category = categoryById.get(m.categoryId.toString());
          return {
            menuItemId: m._id.toString(),
            menuItemName: m.name,
            categoryName: category?.name ?? null,
            categoryOrder: category?.order ?? 999,
            ourPriceCents: m.priceCents,
            entries,
            minCents: prices[0],
            avgCents: Math.round(avg),
            maxCents: prices[prices.length - 1],
            diffPct: Math.round(((m.priceCents - avg) / avg) * 1000) / 10,
          };
        })
        .sort((a, b) => a.categoryOrder - b.categoryOrder || a.menuItemName.localeCompare(b.menuItemName, "es"));
    },
  },

  Competitor: {
    id: (doc: CompetitorDoc) => doc._id.toString(),
    readStatus: (doc: CompetitorDoc) =>
      doc.readStatus === "reading" && doc.readStartedAt && Date.now() - doc.readStartedAt.getTime() > STALE_READ_MS ? "error" : doc.readStatus,
    lastReadError: (doc: CompetitorDoc) =>
      doc.readStatus === "reading" && doc.readStartedAt && Date.now() - doc.readStartedAt.getTime() > STALE_READ_MS
        ? "La lectura se interrumpió: vuelve a intentarlo"
        : doc.lastReadError ?? null,
    lastReadAt: (doc: CompetitorDoc) => doc.lastReadAt?.toISOString() ?? null,
    sources: (doc: CompetitorDoc) =>
      doc.sources.map((s) => ({
        id: s._id.toString(),
        kind: s.kind,
        url: s.url ?? null,
        fileName: s.fileName ?? null,
        mimeType: s.mimeType ?? null,
      })),
    items: async (doc: CompetitorDoc) => {
      const ids = doc.items.map((i) => i.menuItemId).filter(Boolean);
      const names = new Map((await MenuItem.find({ _id: { $in: ids } }).select("name").lean()).map((m) => [m._id.toString(), m.name]));
      return doc.items.map((i) => ({
        id: i._id.toString(),
        name: i.name,
        size: i.size ?? null,
        category: i.category ?? null,
        priceCents: i.priceCents,
        menuItemId: i.menuItemId?.toString() ?? null,
        menuItemName: i.menuItemId ? names.get(i.menuItemId.toString()) ?? null : null,
        matchConfirmed: !!i.matchConfirmed,
        manual: !!i.manual,
        previousPriceCents: i.previousPriceCents ?? null,
        priceChangedAt: i.priceChangedAt?.toISOString() ?? null,
      }));
    },
  },

  Mutation: {
    createCompetitor: async (_: unknown, args: { name: string; neighborhood?: string; notes?: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const name = args.name.trim();
      if (!name) throw new Error("Escribe el nombre de la cafetería");
      return Competitor.create({ name: name.slice(0, 120), neighborhood: trimOrUndefined(args.neighborhood), notes: trimOrUndefined(args.notes, 500) });
    },
    updateCompetitor: async (_: unknown, args: { id: string; name?: string; neighborhood?: string | null; notes?: string | null }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      if (args.name !== undefined) {
        if (!args.name.trim()) throw new Error("Escribe el nombre de la cafetería");
        doc.name = args.name.trim().slice(0, 120);
      }
      if (args.neighborhood !== undefined) doc.neighborhood = trimOrUndefined(args.neighborhood);
      if (args.notes !== undefined) doc.notes = trimOrUndefined(args.notes, 500);
      doc.updatedAt = new Date();
      return doc.save();
    },
    deleteCompetitor: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      await Competitor.deleteOne({ _id: doc._id });
      await Promise.all(doc.sources.map((s) => removeFile(s.filePath)));
      return true;
    },
    addCompetitorUrl: async (_: unknown, args: { id: string; url: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      let url: URL;
      try {
        url = new URL(args.url.trim());
      } catch {
        throw new Error("La dirección no es válida (empieza por https://)");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("La dirección debe empezar por http:// o https://");
      if (doc.sources.length >= MAX_SOURCES_PER_COMPETITOR) throw new Error(`Como mucho ${MAX_SOURCES_PER_COMPETITOR} fuentes por cafetería`);
      if (doc.sources.some((s) => s.url === url.toString())) throw new Error("Ese enlace ya está añadido");
      doc.sources.push({ kind: "url", url: url.toString() } as any);
      doc.updatedAt = new Date();
      return doc.save();
    },
    removeCompetitorSource: async (_: unknown, args: { id: string; sourceId: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      const source = doc.sources.find((s) => s._id.toString() === args.sourceId);
      if (!source) throw new Error("Fuente no encontrada");
      doc.sources = doc.sources.filter((s) => s._id.toString() !== args.sourceId) as any;
      doc.updatedAt = new Date();
      await doc.save();
      await removeFile(source.filePath);
      return doc;
    },
    readCompetitorMenu: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      if (!aiEnabled()) throw new Error("La lectura de menús no está configurada: falta la clave de la API de Anthropic");
      const doc = await find(args.id);
      if (!doc.sources.length) throw new Error("Añade primero un enlace o un archivo con su menú");
      const now = new Date();
      // Solo una lectura a la vez por cafeteria (salvo que la anterior se diera por perdida)
      const claimed = await Competitor.findOneAndUpdate(
        { _id: doc._id, $or: [{ readStatus: { $ne: "reading" } }, { readStartedAt: { $lt: new Date(now.getTime() - STALE_READ_MS) } }] },
        { readStatus: "reading", readStartedAt: now, lastReadError: null, updatedAt: now },
        { new: true }
      );
      if (!claimed) throw new Error("Ya se está leyendo el menú de esta cafetería");
      void runRead(claimed._id, await actorName(ctx));
      return claimed;
    },
    updateCompetitorItem: async (
      _: unknown,
      args: { id: string; itemId: string; input: { name: string; size?: string | null; priceCents: number; menuItemId?: string | null }; matchConfirmed?: boolean | null },
      ctx: GraphQLContext
    ) => {
      gestion(ctx);
      const doc = await find(args.id);
      const item = doc.items.find((i) => i._id.toString() === args.itemId);
      if (!item) throw new Error("Producto no encontrado");
      const clean = cleanItemInput(args.input);
      const matchChanged = (item.menuItemId?.toString() ?? null) !== (clean.menuItemId?.toString() ?? null);
      if (clean.priceCents !== item.priceCents) {
        item.previousPriceCents = item.priceCents;
        item.priceChangedAt = new Date();
      }
      Object.assign(item, clean);
      // Elegir el equivalente a mano ya es confirmarlo
      item.matchConfirmed = typeof args.matchConfirmed === "boolean" ? args.matchConfirmed : matchChanged ? true : item.matchConfirmed;
      doc.updatedAt = new Date();
      return doc.save();
    },
    addCompetitorItem: async (_: unknown, args: { id: string; input: { name: string; size?: string | null; priceCents: number; menuItemId?: string | null } }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      doc.items.push({ ...cleanItemInput(args.input), matchConfirmed: true, manual: true } as any);
      doc.updatedAt = new Date();
      return doc.save();
    },
    deleteCompetitorItem: async (_: unknown, args: { id: string; itemId: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      doc.items = doc.items.filter((i) => i._id.toString() !== args.itemId) as any;
      doc.updatedAt = new Date();
      return doc.save();
    },
    confirmCompetitorMatches: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      gestion(ctx);
      const doc = await find(args.id);
      for (const item of doc.items) if (item.menuItemId) item.matchConfirmed = true;
      doc.updatedAt = new Date();
      return doc.save();
    },
  },
};
