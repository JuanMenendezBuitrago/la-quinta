import { Types } from "mongoose";
import { env } from "../../config/env";
import { Order } from "../orders/model";
import { CashClosing } from "../cash/model";
import { BANK_DEPOSIT, Expense } from "../expenses/model";
import { LoyaltyTransaction } from "../loyalty/model";
import { Shift } from "../shifts/model";
import { DEFAULT_WEEKLY_HOURS, StaffUserDoc } from "./model";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de esa fecha ("YYYY-MM-DD"). */
function mondayOf(date: string) {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(date, -weekday);
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "YYYY-MM-DD" y "HH:mm" de ahora en la tienda. */
function storeNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.storeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/**
 * Instante en que empieza ese dia en la tienda. Sin horario de verano en el local: el desfase del
 * mediodia vale para todo el dia.
 */
function storeDayStart(date: string) {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const local = storeNow(noonUtc);
  const offsetMin = minutesOf(local.time) - 12 * 60 + (local.date === date ? 0 : local.date > date ? 1440 : -1440);
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetMin * 60_000);
}

export interface ActivityShift {
  date: string;
  start: string;
  end: string;
  note?: string | null;
  minutes: number;
  overtimeMinutes: number;
  done: boolean;
}

/**
 * Resumen de lo que hizo una persona del personal entre dos fechas (ambas incluidas, en hora de la
 * tienda): turnos y horas (normales y extra), lo que se le debe por ellas y lo que quedo a su nombre
 * (pedidos que tomo y cobro, rebajas, cierres, gastos, ajustes de sellos).
 *
 * Horas extra: por semana, de lunes a domingo; las horas de los turnos se suman en orden y las que
 * pasan de las horas normales de la semana (weeklyHours) son extra. Por eso se leen las semanas
 * completas aunque el periodo empiece o acabe a mitad: un turno del dia 1 puede ser extra por los
 * de los dias anteriores. Solo cuentan los turnos ya hechos (hasta ahora); los que quedan del
 * periodo salen aparte como programados.
 */
export async function staffActivity(member: StaffUserDoc, from: string, to: string, now = new Date()) {
  if (!isValidDate(from) || !isValidDate(to)) throw new Error("Las fechas deben tener el formato AAAA-MM-DD");
  if (to < from) throw new Error("La fecha final debe ser posterior a la inicial");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) throw new Error("El periodo es demasiado largo (como mucho un año)");

  const staffId = member._id;
  const weeklyMinutes = (member.weeklyHours ?? DEFAULT_WEEKLY_HOURS) * 60;
  const today = storeNow(now);

  const shiftDocs = await Shift.find({ staffId, date: { $gte: mondayOf(from), $lte: to } })
    .sort({ date: 1, start: 1 })
    .lean();

  // Minutos ya trabajados en cada semana antes del turno que se mira.
  const weekUsed = new Map<string, number>();
  const shifts: ActivityShift[] = [];
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let upcomingMinutes = 0;
  let upcomingCount = 0;
  for (const s of shiftDocs) {
    const minutes = minutesOf(s.end) - minutesOf(s.start);
    const done = s.date < today.date || (s.date === today.date && s.end <= today.time);
    if (!done) {
      if (s.date >= from) {
        upcomingMinutes += minutes;
        upcomingCount += 1;
      }
      continue;
    }
    const week = mondayOf(s.date);
    const used = weekUsed.get(week) ?? 0;
    const overtime = Math.max(0, used + minutes - Math.max(weeklyMinutes, used));
    weekUsed.set(week, used + minutes);
    if (s.date < from) continue;
    workedMinutes += minutes;
    overtimeMinutes += overtime;
    shifts.push({ date: s.date, start: s.start, end: s.end, note: s.note ?? null, minutes, overtimeMinutes: overtime, done });
  }
  const normalMinutes = workedMinutes - overtimeMinutes;

  const hourly = member.hourlyRateCents ?? null;
  const overtimeRate = member.overtimeRateCents ?? hourly;
  const normalPayCents = hourly == null ? null : Math.round((normalMinutes / 60) * hourly);
  const overtimePayCents = overtimeRate == null ? null : Math.round((overtimeMinutes / 60) * overtimeRate);
  const payCents = normalPayCents == null || overtimePayCents == null ? null : normalPayCents + overtimePayCents;

  // Lo que quedo a su nombre en el periodo (instantes reales, del inicio de `from` al final de `to`).
  const start = storeDayStart(from);
  const end = storeDayStart(addDays(to, 1));
  const range = { $gte: start, $lt: end };
  const id = new Types.ObjectId(staffId);
  const sum = async (model: any, match: Record<string, unknown>, field: string) => {
    const [row] = await model.aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, cents: { $sum: `$${field}` } } }]);
    return { count: row?.count ?? 0, cents: row?.cents ?? 0 };
  };
  const [taken, charged, discounts, cancelled, closings, expenses, stampMoves] = await Promise.all([
    sum(Order, { createdByStaffId: id, createdAt: range, status: { $ne: "CANCELADO" } }, "totalCents"),
    sum(Order, { paidByStaffId: id, paidAt: range, status: { $ne: "CANCELADO" } }, "totalCents"),
    sum(Order, { "discount.staffId": id, "discount.at": range, status: { $ne: "CANCELADO" } }, "discount.amountCents"),
    Order.countDocuments({ status: "CANCELADO", statusHistory: { $elemMatch: { status: "CANCELADO", staffId: id, at: range } } }),
    CashClosing.countDocuments({ staffId: id, createdAt: range }),
    sum(Expense, { staffId: id, createdAt: range, category: { $ne: BANK_DEPOSIT } }, "amountCents"), // ingresos al banco: no son gasto
    LoyaltyTransaction.countDocuments({ staffId: id, createdAt: range }),
  ]);

  return {
    from,
    to,
    weeklyHours: member.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
    shiftsCount: shifts.length,
    workedMinutes,
    normalMinutes,
    overtimeMinutes,
    upcomingShiftsCount: upcomingCount,
    upcomingMinutes,
    normalPayCents,
    overtimePayCents,
    payCents,
    shifts,
    ordersTakenCount: taken.count,
    ordersTakenCents: taken.cents,
    ordersChargedCount: charged.count,
    ordersChargedCents: charged.cents,
    discountsCount: discounts.count,
    discountsCents: discounts.cents,
    ordersCancelledCount: cancelled,
    cashClosingsCount: closings,
    expensesCount: expenses.count,
    expensesCents: expenses.cents,
    stampMovementsCount: stampMoves,
  };
}
