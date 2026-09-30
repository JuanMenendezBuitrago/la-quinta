import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { MenuItem } from "../menu/model";
import { Coffee, CoffeePresentationDoc, CoffeeProcess } from "./model";
import { CoffeeInput, cleanCoffeeInput, coffeeFields, syncPresentations } from "./sync";

// El indice unico de nombre compara sin tildes ni mayusculas (collation es, strength 1).
const NAME_COLLATION = { locale: "es", strength: 1 } as const;

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await Coffee.findOne({ name, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .collation(NAME_COLLATION)
    .lean();
  if (clash) throw new Error(`Ya existe el cafe «${clash.name}»`);
}

function processName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Indica el nombre del proceso");
  if (clean.length > 40) throw new Error("El nombre del proceso no puede pasar de 40 caracteres");
  return clean;
}

async function assertProcessNameFree(name: string, exceptId?: string) {
  const clash = await CoffeeProcess.findOne({ name, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .collation(NAME_COLLATION)
    .lean();
  if (clash) throw new Error(`Ya existe el proceso «${clash.name}»`);
}

async function assertProcessExists(processId: Types.ObjectId | null) {
  if (processId && !(await CoffeeProcess.exists({ _id: processId }))) throw new Error("Proceso no encontrado");
}

export const coffeeResolvers = {
  Query: {
    coffees: (_: unknown, args: { includeUnavailable?: boolean }, ctx: GraphQLContext) => {
      if (args.includeUnavailable) requireStaff(ctx, ["gestion", "barra"]);
      return Coffee.find(args.includeUnavailable ? {} : { available: true })
        .collation(NAME_COLLATION)
        .sort({ name: 1 })
        .lean()
        .exec();
    },
    coffeeProcesses: () => CoffeeProcess.find().collation(NAME_COLLATION).sort({ name: 1 }).lean().exec(),
  },
  CoffeeProcess: {
    id: (doc: { _id: Types.ObjectId }) => doc._id.toString(),
    coffeeCount: (doc: { _id: Types.ObjectId }) => Coffee.countDocuments({ processId: doc._id }).exec(),
  },
  Coffee: {
    id: (doc: { _id: Types.ObjectId }) => doc._id.toString(),
    tastingNotes: (doc: { tastingNotes?: string[] }) => doc.tastingNotes ?? [],
    process: (doc: { processId?: Types.ObjectId | null }) =>
      doc.processId ? CoffeeProcess.findById(doc.processId).lean().exec() : null,
    presentations: async (
      doc: { presentations: CoffeePresentationDoc[] },
      args: { includeUnavailable?: boolean },
      ctx: GraphQLContext
    ) => {
      if (args.includeUnavailable) requireStaff(ctx, ["gestion", "barra"]);
      const items = await MenuItem.find({ _id: { $in: doc.presentations.map((p) => p.menuItemId) } }).lean();
      return doc.presentations
        .filter((p) => args.includeUnavailable || p.available)
        .flatMap((p) => {
          const menuItem = items.find((i) => i._id.equals(p.menuItemId));
          // Producto borrado desde la carta: se vuelve a crear al guardar el cafe.
          return menuItem ? [{ grams: p.grams, available: p.available, priceCents: menuItem.priceCents, menuItem }] : [];
        });
    },
  },
  MenuItem: {
    coffee: (doc: { _id: Types.ObjectId }) => Coffee.findOne({ "presentations.menuItemId": doc._id }).lean().exec(),
  },
  Mutation: {
    createCoffee: async (_: unknown, args: { input: CoffeeInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const coffee = cleanCoffeeInput(args.input);
      await assertNameFree(coffee.name);
      await assertProcessExists(coffee.processId);
      const presentations = await syncPresentations(coffee);
      return Coffee.create(coffeeFields(coffee, presentations));
    },
    updateCoffee: async (_: unknown, args: { id: string; input: CoffeeInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Cafe no encontrado");
      const current = await Coffee.findById(args.id);
      if (!current) throw new Error("Cafe no encontrado");
      const coffee = cleanCoffeeInput(args.input);
      await assertNameFree(coffee.name, args.id);
      await assertProcessExists(coffee.processId);
      const existing = current.toObject().presentations;
      const presentations = await syncPresentations(coffee, existing);
      current.set(coffeeFields(coffee, presentations));
      return current.save();
    },

    createCoffeeProcess: async (_: unknown, args: { name: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const name = processName(args.name);
      await assertProcessNameFree(name);
      return CoffeeProcess.create({ name });
    },
    renameCoffeeProcess: async (_: unknown, args: { id: string; name: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Proceso no encontrado");
      const name = processName(args.name);
      await assertProcessNameFree(name, args.id);
      const process = await CoffeeProcess.findByIdAndUpdate(args.id, { name }, { new: true });
      if (!process) throw new Error("Proceso no encontrado");
      return process;
    },
    deleteCoffeeProcess: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Proceso no encontrado");
      const using = await Coffee.find({ processId: args.id }).select("name").lean();
      if (using.length) throw new Error(`Lo usan: ${using.map((c) => c.name).join(", ")}. Cámbiales el proceso antes`);
      return !!(await CoffeeProcess.findByIdAndDelete(args.id));
    },
  },
};
