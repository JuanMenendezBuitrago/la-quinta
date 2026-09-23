import { GraphQLContext, requireStaff } from "../../graphql/context";
import { MenuCategory, MenuItem } from "./model";

export const menuResolvers = {
  Query: {
    menu: async () => {
      return MenuCategory.find().sort({ order: 1 }).exec();
    },
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
      return MenuItem.create(args.input);
    },
    updateMenuItem: async (
      _: unknown,
      args: { id: string; input: any },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const item = await MenuItem.findByIdAndUpdate(args.id, args.input, { new: true });
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
  },
};
