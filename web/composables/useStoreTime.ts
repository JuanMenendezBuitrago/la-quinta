import type { OpeningHours } from "./useSiteSettings";

const DAY_PLURAL = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** Dia de la semana ISO (1 = lunes ... 7 = domingo) de un "YYYY-MM-DD" del calendario de la tienda. */
function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function shortTime(hhmm: string) {
  return hhmm.replace(/^0(\d)/, "$1");
}

/**
 * Motivo por el que no se puede recoger a esa hora ("YYYY-MM-DDTHH:mm" de la tienda), o null.
 * Es el mismo criterio que aplica la API (settings/openingHours.ts), que es quien decide:
 * aqui solo sirve para avisar antes de enviar.
 */
export function pickupOutsideHoursReason(value: string, hours: OpeningHours[]) {
  const [date, time] = value.split("T");
  const weekday = weekdayOf(date);
  const day = hours.find((h) => h.weekday === weekday);
  if (!day) return `Los ${DAY_PLURAL[weekday]} la tienda está cerrada: elige otro día.`;
  if (time < day.open || time > day.close) {
    return `Los ${DAY_PLURAL[weekday]} se puede recoger de ${shortTime(day.open)} a ${shortTime(day.close)}.`;
  }
  return null;
}

/**
 * Primera hora de recogida valida a partir de `from` ("YYYY-MM-DDTHH:mm" de la tienda):
 * la propia hora si la tienda esta abierta, si no la siguiente apertura. null si no abre nunca.
 */
export function firstPickupSlot(from: string, hours: OpeningHours[]) {
  const [date, time] = from.split("T");
  for (let i = 0; i < 8; i++) {
    const day = addDays(date, i);
    const h = hours.find((x) => x.weekday === weekdayOf(day));
    if (!h) continue;
    if (i === 0 && time > h.close) continue;
    return `${day}T${i === 0 && time > h.open ? time : h.open}`;
  }
  return null;
}

/**
 * Horas "de la tienda": la recogida es en Medellin, asi que las horas se eligen y se muestran
 * en la zona horaria de la tienda, no en la del navegador. Un cliente con el movil en otra zona
 * (o el servidor de Nuxt en UTC durante el SSR) ve y elige exactamente las mismas horas.
 */
export function useStoreTime() {
  const timeZone = useRuntimeConfig().public.storeTimeZone as string;

  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  function wallClock(date: Date) {
    const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
    return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
  }

  /** Diferencia (ms) entre la hora de la tienda y UTC en ese instante. */
  function offsetAt(date: Date) {
    const w = wallClock(date);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(date.getTime() / 1000) * 1000;
  }

  /** Date -> "YYYY-MM-DDTHH:mm" (valor de un <input type="datetime-local">) en hora de la tienda. */
  function toStoreInput(date: Date) {
    const w = wallClock(date);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
  }

  /** "YYYY-MM-DDTHH:mm" interpretado como hora de la tienda -> Date. */
  function fromStoreInput(value: string) {
    const [date, time] = value.split("T");
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    // Dos pasadas por si el desfase cambia justo en ese intervalo (horario de verano).
    let result = asUtc - offsetAt(new Date(asUtc));
    result = asUtc - offsetAt(new Date(result));
    return new Date(result);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("es-ES", { timeZone, hour: "2-digit", minute: "2-digit" });
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("es-ES", { timeZone, dateStyle: "medium", timeStyle: "short" });
  }

  return { timeZone, toStoreInput, fromStoreInput, formatTime, formatDateTime };
}
