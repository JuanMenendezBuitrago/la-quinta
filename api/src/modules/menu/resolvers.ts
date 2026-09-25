import { GraphQLContext, requireStaff } from "../../graphql/context";
import { Types } from "mongoose";
import { MenuCategory, MenuItem, ModifierGroup, ModifierGroupDoc } from "./model";

const MAX_PRICE_DELTA_CENTS = 1_000_000;

interface ModifierGroupInput {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id?: string | null; name: string; priceDeltaCents: number; available?: boolean | null }[];
}

/** Valida y normaliza un grupo; conserva los ids de las opciones existentes que se editan. */
function modifierGroupData(input: ModifierGroupInput, existing?: ModifierGroupDoc | null) {
  const name = input.name.trim();
  if (!name) throw new Error("El grupo necesita un nombre");
  if (!input.options.length) throw new Error("El grupo necesita al menos una opcion");
  if (!Number.isInteger(input.minSelect) || !Number.isInteger(input.maxSelect) || input.minSelect < 0 || input.maxSelect < 1) {
    throw new Error("Limites de seleccion no validos");
  }
  if (input.minSelect > input.maxSelect) throw new Error("El minimo no puede ser mayor que el maximo");
  if (input.maxSelect > input.options.length) throw new Error("El maximo no puede superar el numero de opciones");

  const seenNames = new Set<string>();
  const options = input.options.map((o) => {
    const optionName = o.name.trim();
    if (!optionName) throw new Error("Todas las opciones necesitan un nombre");
    const key = optionName.toLowerCase();
    if (seenNames.has(key)) throw new Error(`La opcion "${optionName}" esta repetida`);
    seenNames.add(key);
    if (!Number.isInteger(o.priceDeltaCents) || o.priceDeltaCents < 0 || o.priceDeltaCents > MAX_PRICE_DELTA_CENTS) {
      throw new Error(`Suplemento no valido en "${optionName}"`);
    }
    if (o.id && !existing?.options.some((x) => x._id.toString() === o.id)) throw new Error("Opcion no encontrada");
    return {
      _id: o.id ? new Types.ObjectId(o.id) : new Types.ObjectId(),
      name: optionName,
      priceDeltaCents: o.priceDeltaCents,
      available: o.available ?? true,
    };
  });
  return { name, minSelect: input.minSelect, maxSelect: input.maxSelect, options };
}

/**
 * Personalizaciones de un producto: grupos existentes, sin repetir, y la opcion por defecto
 * (si la hay) tiene que ser de ese grupo. Un grupo obligatorio de una sola opcion necesita
 * defecto: si no, el "+" de la carta no sabria que servir.
 */
async function validateItemModifiers(modifiers: { groupId: string; defaultOptionId?: string | null }[]) {
  const ids = modifiers.map((m) => m.groupId);
  if (new Set(ids).size !== ids.length) throw new Error("Una personalizacion esta repetida en el producto");
  const groups = await ModifierGroup.find({ _id: { $in: ids } }).lean();
  return modifiers.map((m) => {
    const group = groups.find((g) => g._id.toString() === m.groupId);
    if (!group) throw new Error("Personalizacion no encontrada");
    if (m.defaultOptionId && !group.options.some((o) => o._id.toString() === m.defaultOptionId)) {
      throw new Error(`La opcion por defecto no pertenece a "${group.name}"`);
    }
    if (!m.defaultOptionId && group.minSelect >= 1 && group.maxSelect === 1) {
      throw new Error(`Elige la opcion por defecto de "${group.name}"`);
    }
    return { groupId: group._id, defaultOptionId: m.defaultOptionId ? new Types.ObjectId(m.defaultOptionId) : null };
  });
}

async function menuItemData(input: any) {
  if (input.modifiers === undefined || input.modifiers === null) {
    const { modifiers: _omit, ...rest } = input;
    return rest;
  }
  return { ...input, modifiers: await validateItemModifiers(input.modifiers) };
}

export const menuResolvers = {
  Query: {
    menu: async () => {
      return MenuCategory.find().sort({ order: 1 }).exec();
    },
    modifierGroups: async () => ModifierGroup.find().sort({ name: 1 }).exec(),
  },
  MenuCategory: {
    id: (doc: any) => doc._id.toString(),
    items: (doc: any, args: { includeUnavailable?: boolean }, ctx: GraphQLContext) => {
      const filter: Record<string, unknown> = { categoryId: doc._id };
      if (args.includeUnavailable) {
        requireStaff(ctx, ["gestion", "barra"]);
      } else {
        filter.available = true;
      }
      return MenuItem.find(filter).exec();
    },
  },
  MenuItem: {
    id: (doc: any) => doc._id.toString(),
    category: (doc: any) => MenuCategory.findById(doc.categoryId),
    // Grupos borrados despues de asignarlos no se muestran (deleteModifierGroup ya los quita).
    modifiers: async (doc: any) => {
      const modifiers: { groupId: Types.ObjectId; defaultOptionId?: Types.ObjectId | null }[] = doc.modifiers ?? [];
      if (!modifiers.length) return [];
      const groups = await ModifierGroup.find({ _id: { $in: modifiers.map((m) => m.groupId) } }).exec();
      return modifiers.flatMap((m) => {
        const group = groups.find((g) => g._id.equals(m.groupId));
        return group ? [{ group, defaultOptionId: m.defaultOptionId?.toString() ?? null }] : [];
      });
    },
  },
  ModifierGroup: {
    id: (doc: any) => doc._id.toString(),
    options: (doc: any, args: { includeUnavailable?: boolean }, ctx: GraphQLContext) => {
      if (args.includeUnavailable) {
        requireStaff(ctx, ["gestion", "barra"]);
        return doc.options;
      }
      return doc.options.filter((o: any) => o.available);
    },
  },
  ModifierOption: {
    id: (doc: any) => doc._id.toString(),
  },
  Mutation: {
    createMenuCategory: async (
      _: unknown,
      args: { name: string; order?: number },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      return MenuCategory.create({ name: args.name, order: args.order ?? 0 });
    },
    updateMenuCategory: async (
      _: unknown,
      args: { id: string; name?: string; order?: number },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const update: Record<string, unknown> = {};
      if (args.name !== undefined) update.name = args.name;
      if (args.order !== undefined) update.order = args.order;
      const category = await MenuCategory.findByIdAndUpdate(args.id, update, { new: true });
      if (!category) throw new Error("Categoria no encontrada");
      return category;
    },
    createMenuItem: async (_: unknown, args: { input: any }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return MenuItem.create(await menuItemData(args.input));
    },
    updateMenuItem: async (
      _: unknown,
      args: { id: string; input: any },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const item = await MenuItem.findByIdAndUpdate(args.id, await menuItemData(args.input), { new: true });
      if (!item) throw new Error("Producto no encontrado");
      return item;
    },
    deleteMenuItem: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const result = await MenuItem.findByIdAndDelete(args.id);
      return !!result;
    },
    setMenuItemAvailability: async (
      _: unknown,
      args: { id: string; available: boolean },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const item = await MenuItem.findByIdAndUpdate(
        args.id,
        { available: args.available },
        { new: true }
      );
      if (!item) throw new Error("Producto no encontrado");
      return item;
    },
    createModifierGroup: async (_: unknown, args: { input: ModifierGroupInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return ModifierGroup.create(modifierGroupData(args.input));
    },
    updateModifierGroup: async (_: unknown, args: { id: string; input: ModifierGroupInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const existing = await ModifierGroup.findById(args.id).lean();
      if (!existing) throw new Error("Personalizacion no encontrada");
      const data = modifierGroupData(args.input, existing);
      // Una opcion eliminada que era la de por defecto de algun producto deja ese producto sin
      // defecto: se avisa en lugar de dejar la carta con un "+" que no sabe que servir.
      const kept = new Set(data.options.map((o) => o._id.toString()));
      const removed = existing.options.filter((o) => !kept.has(o._id.toString())).map((o) => o._id);
      if (removed.length) {
        const using = await MenuItem.find({ modifiers: { $elemMatch: { groupId: existing._id, defaultOptionId: { $in: removed } } } })
          .select("name")
          .lean();
        if (using.length) {
          throw new Error(`No se puede eliminar una opcion que es la de por defecto de: ${using.map((i) => i.name).join(", ")}`);
        }
      }
      return ModifierGroup.findByIdAndUpdate(args.id, data, { new: true });
    },
    deleteModifierGroup: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const result = await ModifierGroup.findByIdAndDelete(args.id);
      if (!result) return false;
      await MenuItem.updateMany({}, { $pull: { modifiers: { groupId: result._id } } });
      return true;
    },
  },
};
