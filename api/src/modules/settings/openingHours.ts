import { env } from "../../config/env";

/** Dia de la semana ISO: 1 = lunes ... 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface OpeningHoursDoc {
  weekday: Weekday;
  open: string; // "HH:mm", hora de la tienda
  close: string; // "HH:mm", hora de la tienda
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Los mismos horarios que llevaba el pie de pagina como texto libre.
export const DEFAULT_OPENING_HOURS: OpeningHoursDoc[] = [
  { weekday: 1, open: "07:00", close: "19:00" },
  { weekday: 2, open: "07:00", close: "19:00" },
  { weekday: 3, open: "07:00", close: "19:00" },
  { weekday: 4, open: "07:00", close: "19:00" },
  { weekday: 5, open: "07:00", close: "19:00" },
  { weekday: 6, open: "08:00", close: "20:00" },
  { weekday: 7, open: "08:00", close: "15:00" },
];

const DAY_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_PLURAL = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábados", "Domingos"];

/** Devuelve el motivo si el horario no es valido, o null si lo es. */
export function validateOpeningHours(hours: OpeningHoursDoc[]): string | null {
  const seen = new Set<number>();
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 1 || h.weekday > 7) return "Dia de la semana no valido";
    if (seen.has(h.weekday)) return `${DAY_PLURAL[h.weekday]} aparece dos veces en el horario`;
    seen.add(h.weekday);
    if (!TIME_PATTERN.test(h.open) || !TIME_PATTERN.test(h.close)) return "Las horas deben tener el formato HH:MM";
    if (h.open >= h.close) return `${DAY_PLURAL[h.weekday]}: la hora de cierre debe ser posterior a la de apertura`;
  }
  return null;
}

function formatTime(hhmm: string) {
  return hhmm.replace(/^0(\d)/, "$1");
}

/**
 * Lineas para el pie de pagina, agrupando dias consecutivos con el mismo horario:
 * "Lun – Vie · 7:00 – 19:00", "Sábados · 8:00 – 20:00". Los dias cerrados no aparecen.
 */
export function scheduleLines(hours: OpeningHoursDoc[]) {
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const lines: { label: string; hours: string }[] = [];
  let day = 1;
  while (day <= 7) {
    const current = byDay.get(day as Weekday);
    if (!current) {
      day++;
      continue;
    }
    let end = day;
    while (end < 7) {
      const next = byDay.get((end + 1) as Weekday);
      if (!next || next.open !== current.open || next.close !== current.close) break;
      end++;
    }
    lines.push({
      label: end === day ? DAY_PLURAL[day] : `${DAY_SHORT[day]} – ${DAY_SHORT[end]}`,
      hours: `${formatTime(current.open)} – ${formatTime(current.close)}`,
    });
    day = end + 1;
  }
  return lines;
}

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: env.storeTimeZone,
  hourCycle: "h23",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const WEEKDAY_BY_SHORT: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Dia de la semana y hora ("HH:mm") de un instante, en la hora de la tienda. */
function storeWallClock(date: Date) {
  const p = Object.fromEntries(wallClockFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { weekday: WEEKDAY_BY_SHORT[p.weekday], time: `${p.hour}:${p.minute}` };
}

/**
 * Motivo por el que no se puede recoger un pedido en ese instante (tienda cerrada ese dia
 * o fuera de horario), o null si la tienda esta abierta. Se admite recoger justo a la hora
 * de cierre.
 */
export function pickupOutsideHoursReason(date: Date, hours: OpeningHoursDoc[]): string | null {
  const { weekday, time } = storeWallClock(date);
  const day = hours.find((h) => h.weekday === weekday);
  if (!day) return `Los ${DAY_PLURAL[weekday].toLowerCase()} la tienda esta cerrada: elige otro dia`;
  if (time < day.open || time > day.close) {
    return `Los ${DAY_PLURAL[weekday].toLowerCase()} se puede recoger de ${formatTime(day.open)} a ${formatTime(day.close)}`;
  }
  return null;
}
