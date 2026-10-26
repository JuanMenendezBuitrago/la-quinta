import { GraphQLContext, requireStaff } from "../../graphql/context";
import { env } from "../../config/env";
import { DISCOUNT_REASONS, Order } from "../orders/model";
import { StaffUser } from "../users/model";
import { CashClosing, CashClosingDoc } from "./model";
import { Expense } from "../expenses/model";

// Tope de cordura para los importes que se escriben a mano (100 millones de pesos).
const MAX_AMOUNT_CENTS = 100_000_000;

/** Inicio del dia de hoy en la zona horaria del local (el primer cierre empieza ahi). */
function startOfTodayInStore(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: env.storeTimeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

async function currentPeriodStart(now: Date) {
  const last = await CashClosing.findOne().sort({ periodEnd: -1 }).select("periodEnd").lean();
  return last?.periodEnd ?? startOfTodayInStore(now);
}

/**
 * Lo cobrado en [start, end): los pedidos cobrados en ese rato (paidAt: los de mesa al cobrarlos,
 * los demas al entregarlos con metodo) y, sin metodo, los que no son de mesa entregados en ese
 * rato antes de que se pidiera el metodo al entregar. Los cancelados no cuentan.
 */
async function summarize(start: Date, end: Date) {
  const orders = await Order.find({
    status: { $ne: "CANCELADO" },
    $or: [
      { paidAt: { $gte: start, $lt: end } },
      { paidAt: { $exists: false }, serviceType: { $ne: "MESA" }, status: "ENTREGADO", deliveredAt: { $gte: start, $lt: end } },
    ],
  })
    .select("totalCents paymentMethod paidAt discount redemption")
    .lean();

  const sum = { cashCents: 0, cardCents: 0, transferCents: 0, unknownMethodCents: 0 };
  for (const o of orders) {
    if (!o.paidAt) sum.unknownMethodCents += o.totalCents;
    else if (o.paymentMethod === "EFECTIVO") sum.cashCents += o.totalCents;
    else if (o.paymentMethod === "TARJETA") sum.cardCents += o.totalCents;
    else if (o.paymentMethod === "TRANSFERENCIA") sum.transferCents += o.totalCents;
    else sum.unknownMethodCents += o.totalCents;
  }
  const totalCents = sum.cashCents + sum.cardCents + sum.transferCents + sum.unknownMethodCents;
  return { ordersCount: orders.length, totalCents, ...sum, ...summarizeDiscounts(orders), ...(await summarizeExpenses(end)) };
}

/**
 * Descuentos de esos pedidos, por motivo (en el orden de los motivos, solo los que hay). El canje
 * de sellos cuenta como motivo CANJE; un pedido con canje y descuento suma en los dos motivos,
 * pero es un solo pedido en discountsCount.
 */
function summarizeDiscounts(
  orders: { discount?: { reason: string; amountCents: number } | null; redemption?: { amountCents: number } | null }[]
) {
  const byReason = new Map<string, { count: number; amountCents: number }>();
  const add = (reason: string, amountCents: number) => {
    const row = byReason.get(reason) ?? { count: 0, amountCents: 0 };
    row.count += 1;
    row.amountCents += amountCents;
    byReason.set(reason, row);
  };
  let discountsCount = 0;
  for (const o of orders) {
    if (o.redemption) add("CANJE", o.redemption.amountCents);
    if (o.discount) add(o.discount.reason, o.discount.amountCents);
    if (o.redemption || o.discount) discountsCount += 1;
  }
  const discountsByReason = DISCOUNT_REASONS.filter((r) => byReason.has(r)).map((reason) => ({ reason, ...byReason.get(reason)! }));
  return {
    discountsCount,
    discountsCents: discountsByReason.reduce((n, r) => n + r.amountCents, 0),
    discountsByReason,
  };
}

/** Gastos aun sin cierre registrados antes de `end`: los que se lleva el cierre (ver modules/expenses). */
function pendingExpensesFilter(end: Date) {
  return { closingId: null, createdAt: { $lt: end } };
}
async function summarizeExpenses(end: Date) {
  const expenses = await Expense.find(pendingExpensesFilter(end)).select("_id amountCents method").lean();
  const by = { CAJA: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 };
  for (const e of expenses) by[e.method] += e.amountCents;
  return {
    expensesCount: expenses.length,
    expensesCashCents: by.CAJA,
    expensesCardCents: by.TARJETA,
    expensesTransferCents: by.TRANSFERENCIA,
    expensesOtherMethodCents: by.OTRO,
    expensesOtherCents: by.TARJETA + by.TRANSFERENCIA + by.OTRO,
    expenseIds: expenses.map((e) => e._id),
  };
}

/** Campos derivados, iguales para el resumen en vivo y para un cierre guardado. */
type Figures = {
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  unknownMethodCents: number;
  expensesCashCents?: number;
  expensesCardCents?: number;
  expensesTransferCents?: number;
  expensesOtherMethodCents?: number;
  expensesOtherCents?: number;
};

/** Saldo por metodo: lo que entro y salio por cada via, para cuadrar cajon, datafono y banco. */
function balances(s: Figures) {
  const row = (method: string, inCents: number, outCents = 0) => ({ method, inCents, outCents, balanceCents: inCents - outCents });
  return [
    row("EFECTIVO", s.cashCents, s.expensesCashCents),
    row("TARJETA", s.cardCents, s.expensesCardCents),
    row("TRANSFERENCIA", s.transferCents, s.expensesTransferCents),
    row("OTRO", s.unknownMethodCents, s.expensesOtherMethodCents),
  ];
}

function withTotals<T extends Figures & { expensesCashCents: number; expensesOtherCents: number }>(s: T) {
  const expensesTotalCents = s.expensesCashCents + s.expensesOtherCents;
  return { ...s, expensesTotalCents, netCents: s.totalCents - expensesTotalCents, balances: balances(s) };
}

function validAmount(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_AMOUNT_CENTS) throw new Error(`${label} no valido`);
  return value;
}

export const cashResolvers = {
  CashClosing: {
    id: (doc: CashClosingDoc) => doc._id.toString(),
    periodStart: (doc: CashClosingDoc) => doc.periodStart.toISOString(),
    periodEnd: (doc: CashClosingDoc) => doc.periodEnd.toISOString(),
    createdAt: (doc: CashClosingDoc) => doc.createdAt.toISOString(),
    expectedCashInDrawerCents: (doc: CashClosingDoc) => doc.openingFloatCents + doc.cashCents - (doc.expensesCashCents ?? 0),
    discountsCount: (doc: CashClosingDoc) => doc.discountsCount ?? 0,
    discountsCents: (doc: CashClosingDoc) => doc.discountsCents ?? 0,
    discountsByReason: (doc: CashClosingDoc) => doc.discountsByReason ?? [],
    expensesCount: (doc: CashClosingDoc) => doc.expensesCount ?? 0,
    expensesCashCents: (doc: CashClosingDoc) => doc.expensesCashCents ?? 0,
    expensesOtherCents: (doc: CashClosingDoc) => doc.expensesOtherCents ?? 0,
    expensesTotalCents: (doc: CashClosingDoc) => (doc.expensesCashCents ?? 0) + (doc.expensesOtherCents ?? 0),
    netCents: (doc: CashClosingDoc) => doc.totalCents - (doc.expensesCashCents ?? 0) - (doc.expensesOtherCents ?? 0),
    balances: (doc: CashClosingDoc) => balances(doc),
    note: (doc: CashClosingDoc) => doc.note || null,
  },
  Query: {
    cashSummary: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const now = new Date();
      const start = await currentPeriodStart(now);
      const { expenseIds: _ids, ...summary } = await summarize(start, now);
      return { periodStart: start.toISOString(), periodEnd: now.toISOString(), ...withTotals(summary) };
    },
    cashClosings: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const limit = Math.min(Math.max(args.limit ?? 30, 1), 200);
      return CashClosing.find().sort({ periodEnd: -1 }).limit(limit).lean();
    },
  },
  Mutation: {
    closeCashRegister: async (
      _: unknown,
      args: { openingFloatCents: number; countedCashCents: number; note?: string | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      const openingFloatCents = validAmount(args.openingFloatCents, "Fondo inicial");
      const countedCashCents = validAmount(args.countedCashCents, "Efectivo contado");
      const note = args.note?.trim().slice(0, 500) || undefined;

      // Las cifras se recalculan aqui, en el momento del cierre: lo que se vio en pantalla
      // puede haber cambiado si entretanto se cobro otro pedido.
      const now = new Date();
      const periodStart = await currentPeriodStart(now);
      const { expenseIds, ...summary } = await summarize(periodStart, now);
      const member = await StaffUser.findById(staff.id).select("name").lean();

      let closing;
      try {
        closing = await CashClosing.create({
          periodStart,
          periodEnd: now,
          staffId: staff.id,
          staffName: member?.name ?? "Personal",
          ...summary,
          openingFloatCents,
          countedCashCents,
          differenceCents: countedCashCents - (openingFloatCents + summary.cashCents - summary.expensesCashCents),
          note,
        });
      } catch (err: any) {
        if (err?.code === 11000) throw new Error("Alguien acaba de cerrar la caja. Recarga para ver el nuevo periodo.");
        throw err;
      }
      // Justo los gastos sumados pasan a este cierre y quedan bloqueados (uno registrado mientras
      // tanto se queda para el siguiente).
      await Expense.updateMany({ _id: { $in: expenseIds }, closingId: null }, { $set: { closingId: closing._id } });
      return closing;
    },
  },
};
