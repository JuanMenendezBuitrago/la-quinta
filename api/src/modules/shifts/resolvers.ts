import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { TIME_PATTERN } from "../settings/openingHours";
import { StaffUser } from "../users/model";
import { Shift, ShiftDoc } from "./model";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;
const MAX_DATES_PER_CREATE = 14;

interface ShiftInput {
  staffId: string;
  date: string;
  start: string;
  end: string;
  note?: string | null;
}

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

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function isMonday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

/** Valida lo que llega del formulario (sin la fecha, que se valida aparte). */
async function clean(input: ShiftInput) {
  if (!Types.ObjectId.isValid(input.staffId)) throw new Error("Persona no valida");
  // Solo cuentas propias activas: una cuenta compartida no trabaja turnos.
  const member = await StaffUser.exists({ _id: input.staffId, active: { $ne: false }, shared: { $ne: true } });
  if (!member) throw new Error("Esa persona no esta en el personal activo");
  if (!TIME_PATTERN.test(input.start) || !TIME_PATTERN.test(input.end)) throw new Error("Las horas deben tener el formato HH:MM");
  if (input.end <= input.start) throw new Error("La hora de salida debe ser posterior a la de entrada");
  const note = input.note?.trim() || undefined;
  if (note && note.length > 80) throw new Error("La nota es demasiado larga");
  return { staffId: new Types.ObjectId(input.staffId), start: input.start, end: input.end, note };
}

/** Se pisa con otro turno de la misma persona ese dia (tocarse, 7-15 y 15-19, no cuenta). */
async function overlaps(staffId: Types.ObjectId, date: string, start: string, end: string, exceptId?: string) {
  return !!(await Shift.exists({
    staffId,
    date,
    start: { $lt: end },
    end: { $gt: start },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }));
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

async function toGraphql(list: ShiftDoc[]) {
  const ids = [...new Set(list.map((s) => s.staffId.toString()))];
  const staff = await StaffUser.find({ _id: { $in: ids } }).select("name avatar").lean();
  const byId = new Map(staff.map((s) => [s._id.toString(), s]));
  return list.map((s) => {
    const member = byId.get(s.staffId.toString());
    return {
      id: s._id.toString(),
      staffId: s.staffId.toString(),
      staffName: member?.name ?? "Personal",
      staffAvatar: member?.avatar ?? null,
      date: s.date,
      start: s.start,
      end: s.end,
      note: s.note || null,
      updatedByName: s.updatedByName,
    };
  });
}

async function actorName(ctx: GraphQLContext) {
  const member = await StaffUser.findById(ctx.staff!.id).select("name").lean();
  return member?.name ?? "Personal";
}

export const shiftsResolvers = {
  Query: {
    // Todo el personal ve el cuadrante completo: necesita saber con quien coincide.
    shifts: async (_: unknown, args: { from: string; to: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      if (!isValidDate(args.from) || !isValidDate(args.to)) throw new Error("Fecha no valida");
      const span = daysBetween(args.from, args.to);
      if (span < 0 || span > MAX_RANGE_DAYS) throw new Error("Rango de fechas no valido");
      const list = await Shift.find({ date: { $gte: args.from, $lte: args.to } })
        .sort({ date: 1, start: 1 })
        .lean<ShiftDoc[]>();
      return toGraphql(list);
    },
  },
  Mutation: {
    createShifts: async (_: unknown, args: { input: ShiftInput; dates: string[] }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const dates = [...new Set(args.dates)];
      if (!dates.length) throw new Error("Elige al menos un dia");
      if (dates.length > MAX_DATES_PER_CREATE) throw new Error("Demasiados dias de golpe");
      if (!dates.every(isValidDate)) throw new Error("Fecha no valida");
      const data = await clean(args.input);
      // Todo o nada: si algun dia se pisa, no se crea ninguno y se dice cual.
      for (const date of dates.sort()) {
        if (await overlaps(data.staffId, date, data.start, data.end)) {
          throw new Error(`Se pisa con otro turno que ya tiene el ${formatDay(date)}`);
        }
      }
      const updatedByName = await actorName(ctx);
      const created = await Shift.insertMany(dates.map((date) => ({ ...data, date, updatedByName })));
      return toGraphql(created.map((c) => c.toObject() as ShiftDoc));
    },
    updateShift: async (_: unknown, args: { id: string; input: ShiftInput }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Turno no encontrado");
      if (!isValidDate(args.input.date)) throw new Error("Fecha no valida");
      const { note, ...data } = await clean(args.input);
      if (await overlaps(data.staffId, args.input.date, data.start, data.end, args.id)) {
        throw new Error(`Se pisa con otro turno que ya tiene el ${formatDay(args.input.date)}`);
      }
      const updated = await Shift.findByIdAndUpdate(
        args.id,
        {
          $set: { ...data, date: args.input.date, updatedByName: await actorName(ctx), updatedAt: new Date(), ...(note ? { note } : {}) },
          ...(note ? {} : { $unset: { note: 1 } }),
        },
        { new: true }
      ).lean<ShiftDoc>();
      if (!updated) throw new Error("Turno no encontrado");
      return (await toGraphql([updated]))[0];
    },
    deleteShift: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Turno no encontrado");
      const deleted = await Shift.findByIdAndDelete(args.id).lean();
      if (!deleted) throw new Error("Turno no encontrado");
      return true;
    },
    copyShiftsWeek: async (_: unknown, args: { fromMonday: string; toMonday: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const { fromMonday, toMonday } = args;
      if (!isValidDate(fromMonday) || !isValidDate(toMonday) || !isMonday(fromMonday) || !isMonday(toMonday)) {
        throw new Error("Semana no valida");
      }
      if (fromMonday === toMonday) throw new Error("Elige otra semana");
      const offset = daysBetween(fromMonday, toMonday);
      const source = await Shift.find({ date: { $gte: fromMonday, $lte: addDays(fromMonday, 6) } }).lean<ShiftDoc[]>();
      // Quien ya no esta activo (o la cuenta paso a compartida) no se copia.
      const activeIds = new Set(
        (
          await StaffUser.find({ _id: { $in: source.map((s) => s.staffId) }, active: { $ne: false }, shared: { $ne: true } })
            .select("_id")
            .lean()
        ).map((s) => s._id.toString())
      );
      const updatedByName = await actorName(ctx);
      const toCreate: Omit<ShiftDoc, "_id" | "createdAt" | "updatedAt">[] = [];
      for (const s of source) {
        if (!activeIds.has(s.staffId.toString())) continue;
        const date = addDays(s.date, offset);
        if (await overlaps(s.staffId, date, s.start, s.end)) continue;
        // Tampoco se pisan entre si los que se van a crear (no deberia pasar si el origen era valido).
        if (toCreate.some((c) => c.staffId.equals(s.staffId) && c.date === date && c.start < s.end && c.end > s.start)) continue;
        toCreate.push({ staffId: s.staffId, date, start: s.start, end: s.end, note: s.note, updatedByName });
      }
      if (toCreate.length) await Shift.insertMany(toCreate);
      return toCreate.length;
    },
  },
};
