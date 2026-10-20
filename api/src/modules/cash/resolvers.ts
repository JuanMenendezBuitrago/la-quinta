import { GraphQLContext, requireStaff } from "../../graphql/context";
import { env } from "../../config/env";
import { Order } from "../orders/model";
import { StaffUser } from "../users/model";
import { CashClosing, CashClosingDoc } from "./model";

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
    .select("totalCents paymentMethod paidAt")
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
  return { ordersCount: orders.length, totalCents, ...sum };
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
    expectedCashInDrawerCents: (doc: CashClosingDoc) => doc.openingFloatCents + doc.cashCents,
    note: (doc: CashClosingDoc) => doc.note || null,
  },
  Query: {
    cashSummary: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const now = new Date();
      const start = await currentPeriodStart(now);
      return { periodStart: start.toISOString(), periodEnd: now.toISOString(), ...(await summarize(start, now)) };
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
      const summary = await summarize(periodStart, now);
      const member = await StaffUser.findById(staff.id).select("name").lean();

      try {
        return await CashClosing.create({
          periodStart,
          periodEnd: now,
          staffId: staff.id,
          staffName: member?.name ?? "Personal",
          ...summary,
          openingFloatCents,
          countedCashCents,
          differenceCents: countedCashCents - (openingFloatCents + summary.cashCents),
          note,
        });
      } catch (err: any) {
        if (err?.code === 11000) throw new Error("Alguien acaba de cerrar la caja. Recarga para ver el nuevo periodo.");
        throw err;
      }
    },
  },
};
