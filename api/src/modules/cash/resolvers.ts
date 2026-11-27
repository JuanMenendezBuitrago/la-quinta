import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { env } from "../../config/env";
import { DISCOUNT_REASONS, NO_PARTIAL_PAYMENTS, Order } from "../orders/model";
import { StaffUser } from "../users/model";
import { CashClosing, CashClosingDoc, CashOpening } from "./model";
import { BANK_DEPOSIT, Expense } from "../expenses/model";

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

/** "YYYY-MM-DD" de un instante en la zona horaria del local. */
function storeDateKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.storeTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Lo cobrado y lo gastado por dia en los ultimos `days` dias (hoy incluido). Lo cobrado sigue
 * las mismas reglas que el cierre (summarize): pedidos no cancelados, por su paidAt o, los
 * antiguos sin metodo que no son de mesa, por su entrega. Los gastos, por su fecha (spentAt).
 */
async function dailyStats(days: number, now: Date) {
  const todayStart = startOfTodayInStore(now);
  // Sin horario de verano en el local: cada dia son 24 h exactas.
  const start = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  const tz = env.storeTimeZone;
  const [whole, parts, expenses] = await Promise.all([
    Order.aggregate<{ _id: string; cents: number; count: number }>([
      {
        $match: {
          status: { $ne: "CANCELADO" },
          ...NO_PARTIAL_PAYMENTS,
          $or: [
            { paidAt: { $gte: start, $lte: now } },
            { paidAt: { $exists: false }, serviceType: { $ne: "MESA" }, status: "ENTREGADO", deliveredAt: { $gte: start, $lte: now } },
          ],
        },
      },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$paidAt", "$deliveredAt"] }, timezone: tz } }, cents: { $sum: "$totalCents" }, count: { $sum: 1 } } },
    ]),
    // Cuentas divididas: cada parte el dia que se cobro (el pedido cuenta una vez por dia).
    Order.aggregate<{ _id: string; cents: number; orders: unknown[] }>([
      { $match: { status: { $ne: "CANCELADO" }, payments: { $elemMatch: { at: { $gte: start, $lte: now } } } } },
      { $unwind: "$payments" },
      { $match: { "payments.at": { $gte: start, $lte: now } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$payments.at", timezone: tz } }, cents: { $sum: "$payments.amountCents" }, orders: { $addToSet: "$_id" } } },
    ]),
    Expense.aggregate<{ _id: string; cents: number }>([
      // Los ingresos al banco no son gasto: el dinero sigue siendo del local.
      { $match: { spentAt: { $gte: start, $lte: now }, category: { $ne: BANK_DEPOSIT } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$spentAt", timezone: tz } }, cents: { $sum: "$amountCents" } } },
    ]),
  ]);
  const incomeByDay = new Map(whole.map((r) => [r._id, { cents: r.cents, count: r.count }]));
  for (const r of parts) {
    const day = incomeByDay.get(r._id) ?? { cents: 0, count: 0 };
    incomeByDay.set(r._id, { cents: day.cents + r.cents, count: day.count + r.orders.length });
  }
  const expensesByDay = new Map(expenses.map((r) => [r._id, r.cents]));
  return Array.from({ length: days }, (_, i) => {
    // Mediodia de cada dia: lejos de los bordes, da la fecha correcta en la zona del local.
    const date = storeDateKey(new Date(start.getTime() + i * 86_400_000 + 12 * 3_600_000));
    return {
      date,
      incomeCents: incomeByDay.get(date)?.cents ?? 0,
      ordersCount: incomeByDay.get(date)?.count ?? 0,
      expensesCents: expensesByDay.get(date) ?? 0,
    };
  });
}

/**
 * El periodo empieza donde acabo el ultimo cierre, aunque fuera otro dia: lo que se cobro despues
 * y no se cerro sigue en la caja. Sin ningun cierre, desde el primer pedido (asi el primero lo
 * cuenta todo); sin pedidos, desde ahora.
 */
async function currentPeriodStart(now: Date) {
  const last = await CashClosing.findOne().sort({ periodEnd: -1 }).select("periodEnd").lean();
  if (last) return last.periodEnd;
  const first = await Order.findOne().sort({ createdAt: 1 }).select("createdAt").lean();
  return first?.createdAt ?? now;
}

/**
 * Lo cobrado en [start, end): los pedidos cobrados en ese rato (paidAt: los de mesa al cobrarlos,
 * los demas al entregarlos con metodo) y, sin metodo, los que no son de mesa entregados en ese
 * rato antes de que se pidiera el metodo al entregar. Los cancelados no cuentan.
 */
// expensesFilter: que gastos cuentan. Por defecto, los pendientes (los que se llevaria un cierre
// ahora); para un dia, los de esa fecha; para un cierre pasado, los suyos.
async function summarize(start: Date, end: Date, expensesFilter: Record<string, unknown> = pendingExpensesFilter(end)) {
  const range = { $gte: start, $lt: end };
  const orders = await Order.find({
    status: { $ne: "CANCELADO" },
    $or: [
      { paidAt: range },
      { paidAt: { $exists: false }, serviceType: { $ne: "MESA" }, status: "ENTREGADO", deliveredAt: range },
      // Cuenta dividida: las partes cobradas en este rato, aunque falte alguna por cobrar.
      { payments: { $elemMatch: { at: range } } },
    ],
  })
    .select("totalCents paymentMethod paidAt deliveredAt discount redemption payments")
    .lean();

  type Sum = { cashCents: number; cardCents: number; transferCents: number; unknownMethodCents: number };
  const emptySum = (): Sum => ({ cashCents: 0, cardCents: 0, transferCents: 0, unknownMethodCents: 0 });
  const sum = emptySum();
  // Lo mismo, por dia (en la zona del local): para ver el periodo dia a dia.
  const byDay = new Map<string, Sum & { ordersCount: number; expensesCents: number }>();
  const dayOf = (at: Date) => {
    const key = storeDateKey(at);
    if (!byDay.has(key)) byDay.set(key, { ...emptySum(), ordersCount: 0, expensesCents: 0 });
    return byDay.get(key)!;
  };
  const addTo = (s: Sum, method: string | null | undefined, cents: number) => {
    if (method === "EFECTIVO") s.cashCents += cents;
    else if (method === "TARJETA") s.cardCents += cents;
    else if (method === "TRANSFERENCIA") s.transferCents += cents;
    else s.unknownMethodCents += cents;
  };
  const add = (at: Date, method: string | null | undefined, cents: number) => {
    addTo(sum, method, cents);
    addTo(dayOf(at), method, cents);
  };
  const inRange = (d: Date | null | undefined) => !!d && d >= start && d < end;
  for (const o of orders) {
    if (o.payments?.length) {
      for (const p of o.payments) if (inRange(p.at)) add(p.at, p.method, p.amountCents);
    } else add((o.paidAt ?? o.deliveredAt)!, o.paidAt ? o.paymentMethod : null, o.totalCents);
  }
  // Pedidos y descuentos: los cobrados del todo en este rato (una cuenta dividida, en el cierre de su ultima parte).
  const settled = orders.filter((o) => !o.payments?.length || inRange(o.paidAt));
  for (const o of settled) dayOf((o.paidAt ?? o.deliveredAt)!).ordersCount += 1;
  const totalCents = sum.cashCents + sum.cardCents + sum.transferCents + sum.unknownMethodCents;
  const expenses = await summarizeExpenses(expensesFilter);
  for (const e of expenses.expenseDays) dayOf(e.spentAt).expensesCents += e.amountCents;
  const { expenseDays: _days, ...expenseTotals } = expenses;
  // El mas reciente primero.
  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, d]) => ({ date, ...d, totalCents: d.cashCents + d.cardCents + d.transferCents + d.unknownMethodCents }));
  return { ordersCount: settled.length, totalCents, ...sum, ...summarizeDiscounts(settled), ...expenseTotals, days };
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
async function summarizeExpenses(filter: Record<string, unknown>) {
  const all = await Expense.find(filter).select("_id amountCents method category spentAt").lean();
  // Los ingresos al banco van aparte: salen del cajon (arqueo), pero no son gasto.
  const deposits = all.filter((e) => e.category === BANK_DEPOSIT);
  const expenses = all.filter((e) => e.category !== BANK_DEPOSIT);
  const by = { CAJA: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 };
  for (const e of expenses) by[e.method] += e.amountCents;
  return {
    bankDepositsCount: deposits.length,
    bankDepositsCents: deposits.reduce((n, e) => n + e.amountCents, 0),
    expensesCount: expenses.length,
    expensesCashCents: by.CAJA,
    expensesCardCents: by.TARJETA,
    expensesTransferCents: by.TRANSFERENCIA,
    expensesOtherMethodCents: by.OTRO,
    expensesOtherCents: by.TARJETA + by.TRANSFERENCIA + by.OTRO,
    // Todos, ingresos al banco incluidos, pasan a este cierre.
    expenseIds: all.map((e) => e._id),
    // Para el detalle por dia (sin los ingresos al banco, que no son gasto).
    expenseDays: expenses.map((e) => ({ spentAt: e.spentAt, amountCents: e.amountCents })),
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

/** Fondo inicial anotado para el periodo que empieza en `start` (null si aun no se anoto). */
async function openingFor(start: Date) {
  return CashOpening.findOne({ periodStart: start }).lean();
}

/**
 * Un fondo anotado hoy (desde `cutoff`, el inicio del dia) es el de hoy aunque el periodo empezara
 * antes: se abrio la caja sin cerrar lo de dias anteriores.
 */
function isTodaysOpening(opening: { updatedAt: Date } | null, cutoff: Date) {
  return !!opening && opening.updatedAt >= cutoff;
}

/**
 * Lo que quedo sin cerrar de dias anteriores: del inicio del periodo al inicio de hoy. null si el
 * periodo empezo hoy o si en esos dias no se cobro ni se gasto nada.
 */
async function previousDaysPending(start: Date, now: Date, opening: { amountCents: number; updatedAt: Date } | null) {
  const cutoff = startOfTodayInStore(now);
  if (start >= cutoff) return null;
  const { expenseIds, days: _days, ...s } = await summarize(start, cutoff);
  if (!s.ordersCount && !s.totalCents && !expenseIds.length) return null;
  return {
    periodStart: start.toISOString(),
    periodEnd: cutoff.toISOString(),
    ordersCount: s.ordersCount,
    totalCents: s.totalCents,
    cashCents: s.cashCents,
    cardCents: s.cardCents,
    transferCents: s.transferCents,
    unknownMethodCents: s.unknownMethodCents,
    expensesCount: s.expensesCount,
    expensesCashCents: s.expensesCashCents,
    bankDepositsCents: s.bankDepositsCents,
    openingFloatCents: opening && !isTodaysOpening(opening, cutoff) ? opening.amountCents : null,
  };
}

/** Resumen en vivo del periodo actual, con el fondo inicial si ya se anoto. */
async function liveSummary() {
  const now = new Date();
  const start = await currentPeriodStart(now);
  const [{ expenseIds: _ids, ...summary }, opening] = await Promise.all([summarize(start, now), openingFor(start)]);
  const previousDays = await previousDaysPending(start, now, opening);
  return {
    previousDays,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    ...withTotals(summary),
    openingFloatCents: opening?.amountCents ?? null,
    openingFloatStaffName: opening?.staffName ?? null,
    openingFloatAt: opening ? opening.updatedAt.toISOString() : null,
  };
}

/** Inicio y fin ([start, end)) de un dia "YYYY-MM-DD" en la zona horaria del local. */
function storeDayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new Error("Fecha no valida");
  // Mediodia UTC cae ese mismo dia en el local (Colombia, sin horario de verano): su inicio de dia.
  const start = startOfTodayInStore(new Date(`${date}T12:00:00Z`));
  return { start, end: new Date(start.getTime() + 86_400_000) };
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
    expectedCashInDrawerCents: (doc: CashClosingDoc) =>
      doc.openingFloatCents + doc.cashCents - (doc.expensesCashCents ?? 0) - (doc.bankDepositsCents ?? 0),
    bankDepositsCount: (doc: CashClosingDoc) => doc.bankDepositsCount ?? 0,
    bankDepositsCents: (doc: CashClosingDoc) => doc.bankDepositsCents ?? 0,
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
    cashDailyStats: async (_: unknown, args: { days?: number | null }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const days = Math.min(90, Math.max(1, Math.trunc(args.days ?? 30)));
      return dailyStats(days, new Date());
    },
    cashSummary: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return liveSummary();
    },
    cashDay: async (_: unknown, args: { date: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const { start, end } = storeDayRange(args.date);
      const now = new Date();
      if (start > now) throw new Error("Ese dia aun no ha llegado");
      const until = end < now ? end : now;
      // Los gastos, por su fecha (cerrados o no).
      const { expenseIds: _ids, ...summary } = await summarize(start, until, { spentAt: { $gte: start, $lt: end } });
      return { periodStart: start.toISOString(), periodEnd: until.toISOString(), ...withTotals(summary) };
    },
    cashClosingDays: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Cierre no encontrado");
      const closing = await CashClosing.findById(args.id).select("periodStart periodEnd").lean();
      if (!closing) throw new Error("Cierre no encontrado");
      return (await summarize(closing.periodStart, closing.periodEnd, { closingId: closing._id })).days;
    },
    cashOpeningPending: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return !(await openingFor(await currentPeriodStart(new Date())));
    },
    cashClosings: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const limit = Math.min(Math.max(args.limit ?? 30, 1), 200);
      return CashClosing.find().sort({ periodEnd: -1 }).limit(limit).lean();
    },
  },
  Mutation: {
    setOpeningFloat: async (_: unknown, args: { amountCents: number }, ctx: GraphQLContext) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const amountCents = validAmount(args.amountCents, "Fondo inicial");
      const periodStart = await currentPeriodStart(new Date());
      const member = await StaffUser.findById(staff.id).select("name").lean();
      // Se puede corregir hasta el cierre: queda quien lo anoto por ultima vez.
      await CashOpening.updateOne(
        { periodStart },
        { $set: { amountCents, staffId: staff.id, staffName: member?.name ?? "Personal", updatedAt: new Date() } },
        { upsert: true }
      );
      return liveSummary();
    },

    closeCashRegister: async (
      _: unknown,
      args: { openingFloatCents?: number | null; countedCashCents: number; note?: string | null; previousDays?: boolean | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const countedCashCents = validAmount(args.countedCashCents, "Efectivo contado");
      const note = args.note?.trim().slice(0, 500) || undefined;

      // Las cifras se recalculan aqui, en el momento del cierre: lo que se vio en pantalla
      // puede haber cambiado si entretanto se cobro otro pedido.
      const now = new Date();
      const periodStart = await currentPeriodStart(now);
      // Lo de dias anteriores se cierra hasta el inicio de hoy; lo de hoy queda para el siguiente.
      const periodEnd = args.previousDays ? startOfTodayInStore(now) : now;
      if (periodStart >= periodEnd) throw new Error("No hay nada de días anteriores sin cerrar. Recarga la caja.");
      // El fondo: el que llega con el cierre o, si no, el que se anoto al abrir la caja. Al cerrar
      // dias anteriores, un fondo anotado hoy es el de hoy: no es de ese periodo y pasa al siguiente.
      const opening = await openingFor(periodStart);
      const movesOpening = !!args.previousDays && isTodaysOpening(opening, periodEnd);
      const floatInput = args.openingFloatCents ?? (movesOpening ? undefined : opening?.amountCents);
      if (floatInput == null) throw new Error("Indica el fondo inicial");
      const openingFloatCents = validAmount(floatInput, "Fondo inicial");
      const { expenseIds, days: _days, ...summary } = await summarize(periodStart, periodEnd);
      const member = await StaffUser.findById(staff.id).select("name").lean();

      let closing;
      try {
        closing = await CashClosing.create({
          periodStart,
          periodEnd,
          staffId: staff.id,
          staffName: member?.name ?? "Personal",
          ...summary,
          openingFloatCents,
          countedCashCents,
          differenceCents:
            countedCashCents - (openingFloatCents + summary.cashCents - summary.expensesCashCents - summary.bankDepositsCents),
          note,
        });
      } catch (err: any) {
        if (err?.code === 11000) throw new Error("Alguien acaba de cerrar la caja. Recarga para ver el nuevo periodo.");
        throw err;
      }
      // Justo los gastos sumados pasan a este cierre y quedan bloqueados (uno registrado mientras
      // tanto se queda para el siguiente).
      await Expense.updateMany({ _id: { $in: expenseIds }, closingId: null }, { $set: { closingId: closing._id } });
      // El fondo anotado hoy pasa al periodo nuevo, que empieza donde acaba este cierre.
      if (movesOpening) await CashOpening.updateOne({ _id: opening!._id }, { $set: { periodStart: periodEnd } });
      return closing;
    },
  },
};
