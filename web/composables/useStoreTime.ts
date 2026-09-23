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
