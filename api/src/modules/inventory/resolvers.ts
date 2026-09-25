import { Types } from "mongoose";
import { EVENTS } from "../../config/pubsub";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { MenuItem, ModifierGroup } from "../menu/model";
import { Order } from "../orders/model";
import { StaffUser } from "../users/model";
import {
  isDuplicateKeyError,
  OptionSupply,
  Recipe,
  StockMovement,
  Supply,
  SupplyDoc,
  supplyNameKey,
  SupplyUnit,
} from "./model";
import { applyMovement, roundQty } from "./stock";

const ANY_STAFF = ["barra", "gestion"] as const;
const MAX_QTY = 1_000_000; // 1 t o 1000 L: por encima, seguro que es un error de tecleo

interface SupplyInput {
  name: string;
  unit: SupplyUnit;
  category?: string | null;
  minStock: number;
}

function checkId(id: string, what: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error(`${what} no encontrado`);
}

function positiveQty(qty: number, label = "La cantidad") {
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(`${label} debe ser mayor que 0`);
  if (qty > MAX_QTY) throw new Error(`${label} es demasiado grande`);
  return roundQty(qty);
}

function cleanNote(note: string | null | undefined, required: boolean) {
  const value = note?.trim() ?? "";
  if (required && !value) throw new Error("Indica el motivo");
  if (value.length > 200) throw new Error("La nota no puede pasar de 200 caracteres");
  return value || undefined;
}

function cleanSupply(input: SupplyInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Indica el nombre del insumo");
  if (name.length > 60) throw new Error("El nombre no puede pasar de 60 caracteres");
  const category = input.category?.trim() ?? "";
  if (category.length > 40) throw new Error("La categoria no puede pasar de 40 caracteres");
  if (!Number.isFinite(input.minStock) || input.minStock < 0 || input.minStock > MAX_QTY) {
    throw new Error("El stock minimo no es valido");
  }
  return { name, nameKey: supplyNameKey(name), unit: input.unit, category, minStock: roundQty(input.minStock) };
}

async function findSupply(id: string) {
  checkId(id, "Insumo");
  const supply = await Supply.findById(id).lean();
  if (!supply) throw new Error("Insumo no encontrado");
  return supply;
}

async function findActiveSupply(id: string) {
  const supply = await findSupply(id);
  if (!supply.active) throw new Error(`«${supply.name}» esta desactivado`);
  return supply;
}

function duplicateNameError(err: unknown): never {
  if (isDuplicateKeyError(err)) throw new Error("Ya existe un insumo con ese nombre");
  throw err;
}

export const inventoryResolvers = {
  Query: {
    supplies: async (_: unknown, args: { includeInactive?: boolean | null }, ctx: GraphQLContext) => {
      requireStaff(ctx, [...ANY_STAFF]);
      const filter = args.includeInactive ? {} : { active: true };
      return Supply.find(filter).collation({ locale: "es" }).sort({ category: 1, name: 1 }).lean();
    },

    supplyMovements: async (
      _: unknown,
      args: { supplyId: string; limit?: number | null; offset?: number | null },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, [...ANY_STAFF]);
      checkId(args.supplyId, "Insumo");
      const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
      const offset = Math.max(args.offset ?? 0, 0);
      const movements = await StockMovement.find({ supplyId: args.supplyId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      // Codigos de pedido y nombres del personal en dos consultas, no una por movimiento.
      const orderIds = movements.map((m) => m.orderId).filter(Boolean);
      const staffIds = movements.map((m) => m.staffId).filter(Boolean);
      const [orders, staff] = await Promise.all([
        orderIds.length ? Order.find({ _id: { $in: orderIds } }).select("code").lean() : [],
        staffIds.length ? StaffUser.find({ _id: { $in: staffIds } }).select("name").lean() : [],
      ]);
      const codeById = new Map(orders.map((o) => [o._id.toString(), o.code]));
      const nameById = new Map(staff.map((s) => [s._id.toString(), s.name]));

      return movements.map((m) => ({
        id: m._id.toString(),
        delta: m.delta,
        reason: m.reason,
        orderCode: m.orderId ? codeById.get(m.orderId.toString()) ?? null : null,
        staffName: m.staffId ? nameById.get(m.staffId.toString()) ?? null : null,
        note: m.note ?? null,
        countedQty: m.countedQty ?? null,
        createdAt: m.createdAt.toISOString(),
      }));
    },

    recipes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return Recipe.find().lean();
    },
    optionSupplies: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return OptionSupply.find().lean();
    },
  },

  Mutation: {
    createSupply: async (
      _: unknown,
      args: { input: SupplyInput; initialStock?: number | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const data = cleanSupply(args.input);
      const initial = args.initialStock ?? 0;
      if (!Number.isFinite(initial) || initial < 0 || initial > MAX_QTY) throw new Error("El stock inicial no es valido");

      const supply = await Supply.create(data).catch(duplicateNameError);
      if (initial > 0) {
        return applyMovement({
          supplyId: supply._id,
          delta: initial,
          reason: "conteo",
          countedQty: roundQty(initial),
          staffId: staff.id,
          note: "Stock inicial",
        });
      }
      return supply.toObject();
    },

    updateSupply: async (_: unknown, args: { id: string; input: SupplyInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const current = await findSupply(args.id);
      const data = cleanSupply(args.input);
      // Cambiar g por ml con movimientos ya registrados dejaria el historial y las recetas sin sentido.
      if (data.unit !== current.unit && (await StockMovement.exists({ supplyId: current._id }))) {
        throw new Error("No se puede cambiar la unidad de un insumo con movimientos: crea uno nuevo");
      }
      const supply = await Supply.findByIdAndUpdate(args.id, { $set: data }, { new: true })
        .lean()
        .catch(duplicateNameError);
      if (!supply) throw new Error("Insumo no encontrado");
      return supply;
    },

    setSupplyActive: async (_: unknown, args: { id: string; active: boolean }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      await findSupply(args.id);
      if (!args.active) {
        const used = await Recipe.find({ "lines.supplyId": args.id }).select("menuItemId").lean();
        if (used.length) {
          const items = await MenuItem.find({ _id: { $in: used.map((r) => r.menuItemId) } }).select("name").lean();
          throw new Error(`Esta en las recetas de: ${items.map((i) => i.name).join(", ")}. Quitalo de ellas antes.`);
        }
      }
      return Supply.findByIdAndUpdate(args.id, { $set: { active: args.active } }, { new: true }).lean();
    },

    deleteSupply: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      await findSupply(args.id);
      if (await StockMovement.exists({ supplyId: args.id })) {
        throw new Error("Tiene movimientos registrados: desactivalo en lugar de borrarlo");
      }
      if (await Recipe.exists({ "lines.supplyId": args.id })) {
        throw new Error("Esta en alguna receta: quitalo de ella antes");
      }
      if (await OptionSupply.exists({ supplyId: args.id })) {
        throw new Error("Es el insumo de una opcion de la carta: quitalo de ella antes");
      }
      await Supply.deleteOne({ _id: args.id });
      return true;
    },

    adjustStock: async (
      _: unknown,
      args: { supplyId: string; delta: number; note: string },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      await findSupply(args.supplyId);
      if (!Number.isFinite(args.delta) || roundQty(args.delta) === 0 || Math.abs(args.delta) > MAX_QTY) {
        throw new Error("El ajuste no es valido");
      }
      return applyMovement({
        supplyId: args.supplyId,
        delta: args.delta,
        reason: "ajuste",
        staffId: staff.id,
        note: cleanNote(args.note, true),
      });
    },

    setOptionSupply: async (
      _: unknown,
      args: { optionId: string; supplyId?: string | null; qty?: number | null },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      checkId(args.optionId, "Opcion");
      if (!(await ModifierGroup.exists({ "options._id": args.optionId }))) throw new Error("Opcion no encontrada");
      if (!args.supplyId) {
        await OptionSupply.deleteOne({ optionId: args.optionId });
        return null;
      }
      const supply = await findActiveSupply(args.supplyId);
      const qty = args.qty ? positiveQty(args.qty, `La cantidad de «${supply.name}»`) : null;
      return OptionSupply.findOneAndUpdate(
        { optionId: args.optionId },
        { $set: { supplyId: supply._id, qty } },
        { upsert: true, new: true }
      ).lean();
    },

    setRecipe: async (
      _: unknown,
      args: { menuItemId: string; lines: { supplyId: string; qty: number; onlyTakeaway: boolean }[] },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      checkId(args.menuItemId, "Producto");
      if (!(await MenuItem.exists({ _id: args.menuItemId }))) throw new Error("Producto no encontrado");

      if (!args.lines.length) {
        await Recipe.deleteOne({ menuItemId: args.menuItemId });
        return null;
      }
      if (args.lines.length > 30) throw new Error("Demasiados ingredientes en la receta");

      const seen = new Set<string>();
      const lines = [];
      for (const line of args.lines) {
        const supply = await findActiveSupply(line.supplyId);
        const key = `${line.supplyId}:${line.onlyTakeaway}`;
        if (seen.has(key)) throw new Error(`«${supply.name}» esta repetido en la receta`);
        seen.add(key);
        lines.push({
          supplyId: supply._id,
          qty: positiveQty(line.qty, `La cantidad de «${supply.name}»`),
          onlyTakeaway: line.onlyTakeaway,
        });
      }

      return Recipe.findOneAndUpdate(
        { menuItemId: args.menuItemId },
        { $set: { lines, updatedAt: new Date() } },
        { new: true, upsert: true }
      ).lean();
    },

    recordStockEntry: async (
      _: unknown,
      args: { supplyId: string; qty: number; note?: string | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, [...ANY_STAFF]);
      await findActiveSupply(args.supplyId);
      return applyMovement({
        supplyId: args.supplyId,
        delta: positiveQty(args.qty),
        reason: "compra",
        staffId: staff.id,
        note: cleanNote(args.note, false),
      });
    },

    recordWaste: async (
      _: unknown,
      args: { supplyId: string; qty: number; note: string },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, [...ANY_STAFF]);
      await findActiveSupply(args.supplyId);
      return applyMovement({
        supplyId: args.supplyId,
        delta: -positiveQty(args.qty),
        reason: "merma",
        staffId: staff.id,
        note: cleanNote(args.note, true),
      });
    },

    recordStockCount: async (
      _: unknown,
      args: { counts: { supplyId: string; countedQty: number }[]; note?: string | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, [...ANY_STAFF]);
      if (!args.counts.length) throw new Error("No hay nada que contar");
      const note = cleanNote(args.note, false);

      // Se valida todo antes de registrar nada: un conteo a medias seria peor que ninguno.
      const ids = new Set<string>();
      for (const c of args.counts) {
        await findActiveSupply(c.supplyId);
        if (ids.has(c.supplyId)) throw new Error("Hay un insumo repetido en el conteo");
        ids.add(c.supplyId);
        if (!Number.isFinite(c.countedQty) || c.countedQty < 0 || c.countedQty > MAX_QTY) {
          throw new Error("Hay una cantidad contada que no es valida");
        }
      }

      const result: SupplyDoc[] = [];
      for (const c of args.counts) {
        const counted = roundQty(c.countedQty);
        // El teorico se lee justo antes: si entra un consumo entre medias, la diferencia es minima.
        const current = await findSupply(c.supplyId);
        const delta = roundQty(counted - current.stock);
        // Tambien se registra si cuadra: deja constancia de que se conto ese dia.
        result.push(
          await applyMovement({
            supplyId: c.supplyId,
            delta,
            reason: "conteo",
            countedQty: counted,
            staffId: staff.id,
            note,
          })
        );
      }
      return result;
    },
  },

  Subscription: {
    inventoryAlerts: {
      subscribe: (_: unknown, __: unknown, ctx: GraphQLContext) => {
        requireStaff(ctx, [...ANY_STAFF]);
        return ctx.pubsub.asyncIterator(EVENTS.INVENTORY_LOW);
      },
    },
  },

  Supply: {
    id: (doc: SupplyDoc) => doc._id.toString(),
    low: (doc: SupplyDoc) => doc.stock <= doc.minStock,
  },

  OptionSupply: {
    optionId: (doc: { optionId: Types.ObjectId }) => doc.optionId.toString(),
    supply: (doc: { supplyId: Types.ObjectId }) => Supply.findById(doc.supplyId).lean(),
  },
  Recipe: {
    menuItemId: (doc: { menuItemId: Types.ObjectId }) => doc.menuItemId.toString(),
    lines: async (doc: { lines: { supplyId: Types.ObjectId; qty: number; onlyTakeaway: boolean }[] }) => {
      const supplies = await Supply.find({ _id: { $in: doc.lines.map((l) => l.supplyId) } }).lean();
      const byId = new Map(supplies.map((s) => [s._id.toString(), s]));
      // Un insumo borrado no puede estar en una receta (deleteSupply lo impide); por si acaso, se omite.
      return doc.lines
        .filter((l) => byId.has(l.supplyId.toString()))
        .map((l) => ({ supply: byId.get(l.supplyId.toString()), qty: l.qty, onlyTakeaway: l.onlyTakeaway }));
    },
  },
};
