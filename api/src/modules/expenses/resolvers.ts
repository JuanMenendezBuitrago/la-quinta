import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { StaffUser } from "../users/model";
import { UPLOAD_DIR } from "../uploads/router";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  Expense,
  ExpenseCategory,
  ExpenseDoc,
  ExpenseItem,
  ExpenseMethod,
  isReceiptPath,
  removeReceiptFile,
} from "./model";

// Mismo tope de cordura que el cierre de caja (100 millones de pesos).
const MAX_AMOUNT_CENTS = 100_000_000;
// Proveedores que se ofrecen al autocompletar.
const MAX_SUPPLIERS = 300;
// Desglose: tope de articulos por gasto y de gastos en la lista de pendientes de desglosar.
const MAX_ITEMS = 200;
const MAX_TO_ITEMIZE = 50;

interface ExpenseInput {
  amountCents: number;
  method: ExpenseMethod;
  category: ExpenseCategory;
  description: string;
  supplier?: string | null;
  receiptUrl?: string | null;
  grouped?: boolean | null;
  spentAt?: string | null;
}

interface ExpenseItemInput {
  name: string;
  quantity?: number | null;
  amountCents: number;
}

/** Valida y normaliza lo que llega del formulario. */
function clean(input: ExpenseInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > MAX_AMOUNT_CENTS) {
    throw new Error("Importe no valido");
  }
  if (!EXPENSE_METHODS.includes(input.method)) throw new Error("Metodo de pago no valido");
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new Error("Categoria no valida");
  const description = input.description.trim();
  if (!description) throw new Error("Escribe en que se gasto");
  if (description.length > 200) throw new Error("La descripcion es demasiado larga");
  const supplier = input.supplier?.trim() || undefined;
  if (supplier && supplier.length > 80) throw new Error("El proveedor es demasiado largo");
  const receiptUrl = input.receiptUrl || undefined;
  if (receiptUrl && !isReceiptPath(receiptUrl)) throw new Error("Foto del recibo no valida");
  const spentAt = input.spentAt ? new Date(input.spentAt) : new Date();
  if (Number.isNaN(spentAt.getTime())) throw new Error("Fecha no valida");
  const grouped = Boolean(input.grouped);
  return { amountCents: input.amountCents, method: input.method, category: input.category, description, supplier, receiptUrl, grouped, spentAt };
}

function cleanItems(items: ExpenseItemInput[]): ExpenseItem[] {
  if (items.length > MAX_ITEMS) throw new Error(`Como mucho ${MAX_ITEMS} articulos por gasto`);
  return items.map((item, i) => {
    const name = item.name.trim();
    if (!name) throw new Error(`Falta el nombre del articulo ${i + 1}`);
    if (name.length > 120) throw new Error(`El nombre del articulo ${i + 1} es demasiado largo`);
    if (!Number.isInteger(item.amountCents) || item.amountCents < 1 || item.amountCents > MAX_AMOUNT_CENTS) {
      throw new Error(`Importe no valido en «${name}»`);
    }
    const quantity = item.quantity ?? undefined;
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000)) {
      throw new Error(`Cantidad no valida en «${name}»`);
    }
    return quantity === undefined ? { name, amountCents: item.amountCents } : { name, quantity, amountCents: item.amountCents };
  });
}

function itemsTotal(items: { amountCents: number }[] | undefined) {
  return (items ?? []).reduce((sum, i) => sum + i.amountCents, 0);
}

function toGraphql(e: ExpenseDoc) {
  return {
    id: e._id.toString(),
    amountCents: e.amountCents,
    method: e.method,
    category: e.category,
    description: e.description,
    supplier: e.supplier || null,
    receiptUrl: e.receiptUrl || null,
    grouped: Boolean(e.grouped),
    items: (e.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? null, amountCents: i.amountCents })),
    // Solo cuenta como pendiente si es agrupado o si ya se empezo a desglosar.
    unitemizedCents: e.grouped || e.items?.length ? Math.max(0, e.amountCents - itemsTotal(e.items)) : 0,
    spentAt: e.spentAt.toISOString(),
    staffName: e.staffName,
    closingId: e.closingId?.toString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export const expensesResolvers = {
  Query: {
    pendingExpenses: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const list = await Expense.find({ closingId: null }).sort({ spentAt: -1 }).lean<ExpenseDoc[]>();
      return list.map(toGraphql);
    },
    expenseSuppliers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      // Uno por nombre sin distinguir mayusculas, escrito como se escribio mas veces.
      const rows = await Expense.aggregate<{ name: string }>([
        { $match: { supplier: { $type: "string", $ne: "" } } },
        { $group: { _id: "$supplier", uses: { $sum: 1 }, last: { $max: "$spentAt" } } },
        { $sort: { uses: -1, last: -1 } },
        { $group: { _id: { $toLower: "$_id" }, name: { $first: "$_id" }, uses: { $sum: "$uses" }, last: { $max: "$last" } } },
        { $sort: { uses: -1, last: -1 } },
        { $limit: MAX_SUPPLIERS },
      ]);
      return rows.map((r) => r.name);
    },
    expensesToItemize: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      // Los aun sin cierre ya se ven en «Gastos del periodo»; aqui, los cerrados que se quedaron a medias.
      const list = await Expense.find({
        closingId: { $ne: null },
        grouped: true,
        $expr: { $lt: [{ $sum: { $ifNull: ["$items.amountCents", []] } }, "$amountCents"] },
      })
        .sort({ spentAt: -1 })
        .limit(MAX_TO_ITEMIZE)
        .lean<ExpenseDoc[]>();
      return list.map(toGraphql);
    },
    closingExpenses: async (_: unknown, args: { closingId: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      if (!Types.ObjectId.isValid(args.closingId)) return [];
      const list = await Expense.find({ closingId: args.closingId }).sort({ spentAt: -1 }).lean<ExpenseDoc[]>();
      return list.map(toGraphql);
    },
  },
  Mutation: {
    createExpense: async (_: unknown, args: { input: ExpenseInput }, ctx: GraphQLContext) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      const data = clean(args.input);
      const member = await StaffUser.findById(staff.id).select("name").lean();
      const created = await Expense.create({ ...data, staffId: staff.id, staffName: member?.name ?? "Personal" });
      return toGraphql(created.toObject());
    },
    updateExpense: async (_: unknown, args: { id: string; input: ExpenseInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Gasto no encontrado");
      const { supplier, receiptUrl, ...rest } = clean(args.input);
      // Los opcionales vacios se quitan del documento en vez de guardarse vacios.
      const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      const unset: Record<string, 1> = {};
      if (supplier) set.supplier = supplier;
      else unset.supplier = 1;
      if (receiptUrl) set.receiptUrl = receiptUrl;
      else unset.receiptUrl = 1;
      // Atomico: si entretanto se cerro la caja, el gasto ya tiene closingId y no se toca. Tampoco
      // puede quedar por debajo de lo ya desglosado.
      const previous = await Expense.findOneAndUpdate(
        {
          _id: args.id,
          closingId: null,
          $expr: { $lte: [{ $sum: { $ifNull: ["$items.amountCents", []] } }, rest.amountCents] },
        },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
      ).lean<ExpenseDoc>();
      if (!previous) {
        const current = await Expense.findById(args.id).select("closingId").lean();
        if (!current) throw new Error("Gasto no encontrado");
        throw new Error(
          current.closingId
            ? "Ese gasto ya esta en un cierre de caja y no se puede cambiar"
            : "El importe no puede ser menor que lo ya desglosado por articulos"
        );
      }
      if (previous.receiptUrl && previous.receiptUrl !== receiptUrl) await removeReceiptFile(previous.receiptUrl, UPLOAD_DIR);
      const updated = await Expense.findById(args.id).lean<ExpenseDoc>();
      return toGraphql(updated!);
    },
    deleteExpense: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Gasto no encontrado");
      const deleted = await Expense.findOneAndDelete({ _id: args.id, closingId: null }).lean<ExpenseDoc>();
      if (!deleted) {
        const exists = await Expense.exists({ _id: args.id });
        throw new Error(exists ? "Ese gasto ya esta en un cierre de caja y no se puede borrar" : "Gasto no encontrado");
      }
      await removeReceiptFile(deleted.receiptUrl, UPLOAD_DIR);
      return true;
    },
    setExpenseItems: async (_: unknown, args: { id: string; items: ExpenseItemInput[] }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Gasto no encontrado");
      const items = cleanItems(args.items);
      const total = itemsTotal(items);
      // Atomico frente a un cambio de importe a la vez: solo si el gasto cubre lo desglosado.
      const updated = await Expense.findOneAndUpdate(
        { _id: args.id, amountCents: { $gte: total } },
        { $set: { items, updatedAt: new Date() } },
        { new: true }
      ).lean<ExpenseDoc>();
      if (!updated) {
        const exists = await Expense.exists({ _id: args.id });
        throw new Error(exists ? "Los articulos suman mas que el importe del gasto" : "Gasto no encontrado");
      }
      return toGraphql(updated);
    },
  },
};
