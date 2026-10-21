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
  ExpenseMethod,
  isReceiptPath,
  removeReceiptFile,
} from "./model";

// Mismo tope de cordura que el cierre de caja (100 millones de pesos).
const MAX_AMOUNT_CENTS = 100_000_000;

interface ExpenseInput {
  amountCents: number;
  method: ExpenseMethod;
  category: ExpenseCategory;
  description: string;
  supplier?: string | null;
  receiptUrl?: string | null;
  spentAt?: string | null;
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
  return { amountCents: input.amountCents, method: input.method, category: input.category, description, supplier, receiptUrl, spentAt };
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
      // Atomico: si entretanto se cerro la caja, el gasto ya tiene closingId y no se toca.
      const previous = await Expense.findOneAndUpdate(
        { _id: args.id, closingId: null },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
      ).lean<ExpenseDoc>();
      if (!previous) {
        const exists = await Expense.exists({ _id: args.id });
        throw new Error(exists ? "Ese gasto ya esta en un cierre de caja y no se puede cambiar" : "Gasto no encontrado");
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
  },
};
