import { SITE_SETTINGS_QUERY, useCustomerOrdering, type SiteSettings } from "./useSiteSettings";
import { useStoreTime } from "./useStoreTime";
import { tableLabel } from "./useTables";
import { DISCOUNT_REASON_LABELS, PAYMENT_LABELS, discountLabel } from "./useStaffOrders";

/**
 * Ticket del cliente en la impresora termica (Digital POS DIG-C80250II, 80 mm, ESC/POS) a traves de
 * RawBT, la app Android de la tablet que tiene configurada la impresora (IP y puerto 9100). La web
 * genera los bytes ESC/POS y se los pasa a RawBT con un enlace intent: no hay dialogo de impresion.
 * Si RawBT no esta instalado, Chrome abre su ficha en Google Play (browser_fallback_url).
 *
 * El aspecto es el de la vista previa acordada: logo, datos del local, lineas, canje y descuento,
 * total, pago (con lo recibido y el cambio en efectivo), sellos, QR a "Mi cuenta" y pie.
 */

const COLS = 48; // fuente A: 576 puntos / 12
const COLS_DOUBLE = 24; // doble ancho
const LOGO_DOTS = 400; // 50 mm a 203 ppp
const LOGO_URL = "/ticket-logo.svg"; // logo de una tinta, en negro
// Sellos para la recompensa (LOYALTY_RULES.rewardThresholdStamps en la API).
const REWARD_THRESHOLD = 10;
const STORE_NAME = "La Quinta · Café de especialidad";
const RAWBT_PLAY_URL = "https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter";

const ESC = 0x1b;
const GS = 0x1d;

/** Bytes ESC/POS de un ticket. Texto en la pagina de codigos WPC1252 (tildes, ñ, ¡, ¿, €). */
class EscPos {
  private bytes: number[] = [ESC, 0x40, ESC, 0x74, 16]; // inicializar + ESC t 16 (WPC1252)

  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  align(where: "left" | "center") {
    return this.raw(ESC, 0x61, where === "center" ? 1 : 0);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** Doble ancho y alto (GS ! 0x11). */
  double(on: boolean) {
    return this.raw(GS, 0x21, on ? 0x11 : 0);
  }
  line(text = "") {
    for (const ch of text) this.bytes.push(cp1252(ch));
    return this.raw(0x0a);
  }
  feed(lines: number) {
    return this.raw(ESC, 0x64, lines);
  }
  /** Imagen de 1 bit (GS v 0): filas de `width` puntos, 1 = negro. */
  image(width: number, height: number, dots: Uint8Array) {
    const rowBytes = Math.ceil(width / 8);
    this.raw(GS, 0x76, 0x30, 0, rowBytes & 0xff, rowBytes >> 8, height & 0xff, height >> 8);
    for (let y = 0; y < height; y++) {
      for (let xb = 0; xb < rowBytes; xb++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          if (x < width && dots[y * width + x]) byte |= 0x80 >> bit;
        }
        this.bytes.push(byte);
      }
    }
    return this;
  }
  /** QR modelo 2 que dibuja la propia impresora (GS ( k). */
  qr(data: string, moduleSize = 6) {
    const encoded = Array.from(new TextEncoder().encode(data));
    const len = encoded.length + 3;
    return this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0) // modelo 2
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, moduleSize) // tamaño del modulo
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // correccion de errores M
      .raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...encoded) // datos
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // imprimir
  }
  /** Avanza el papel y corta (GS V 66: corte parcial tras avanzar). */
  cut() {
    return this.raw(GS, 0x56, 66, 0);
  }
  toBase64() {
    let binary = "";
    for (const b of this.bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
}

// WPC1252 coincide con Latin-1 salvo en 0x80-0x9F; de ahi solo hacen falta unos pocos signos.
const CP1252_EXTRA: Record<string, number> = { "€": 0x80, "…": 0x85, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94 };
function cp1252(ch: string) {
  const code = ch.codePointAt(0)!;
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code;
  return CP1252_EXTRA[ch] ?? 0x3f; // "?"
}

// --- Columnas (las mismas cuentas que la vista previa) ---
const money = (n: number) => n.toLocaleString("es-CO");
function cols(left: string, right: string, width = COLS) {
  const space = width - left.length - right.length;
  if (space >= 1) return left + " ".repeat(space) + right;
  return left.slice(0, Math.max(0, width - right.length - 2)) + "… " + right;
}
function wrap(text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if ((line + " " + word).length <= width) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => (l.length > width ? l.match(new RegExp(`.{1,${width}}`, "g"))! : [l]));
}
const rule = (ch = "-") => ch.repeat(COLS);

// Logo pasado a puntos una vez por sesion: SVG -> lienzo de LOGO_DOTS de ancho -> negro o blanco.
let logoDots: Promise<{ width: number; height: number; dots: Uint8Array } | null> | null = null;
function loadLogo() {
  logoDots ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = LOGO_DOTS;
      const height = Math.round((width * (img.naturalHeight || 101.93)) / (img.naturalWidth || 245.21));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const px = ctx.getImageData(0, 0, width, height).data;
      const dots = new Uint8Array(width * height);
      for (let i = 0; i < dots.length; i++) dots[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3 < 128 ? 1 : 0;
      resolve({ width, height, dots });
    };
    img.onerror = () => resolve(null); // sin logo se imprime igual
    img.src = LOGO_URL;
  });
  return logoDots;
}

/** Pedido tal como lo trae la cola o el historial (ORDER_FIELDS en useStaffOrders.ts). */
export interface TicketOrder {
  code: string;
  source?: "WEB" | "STAFF" | null;
  serviceType?: "MESA" | "LLEVAR" | null;
  table?: string | null;
  pickupSlot: string;
  createdAt: string;
  paidAt?: string | null;
  paymentMethod?: keyof typeof PAYMENT_LABELS | null;
  cashReceivedCents?: number | null;
  changeCents?: number | null;
  totalCents: number;
  packagingCents?: number | null;
  items: {
    name: string;
    quantity: number;
    priceCents: number;
    options?: { groupName?: string; name: string; isDefault: boolean; priceDeltaCents?: number }[];
  }[];
  redemption?: { name: string; amountCents: number } | null;
  discount?: { reason: keyof typeof DISCOUNT_REASON_LABELS; note?: string | null; percent?: number | null; amountCents: number } | null;
  customer?: { name: string; customerCode: string; stampsBalance?: number | null } | null;
}

export function useTicketPrinter() {
  const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
  const enabled = computed(() => !!result.value?.siteSettings.ticketPrintingEnabled);
  const customerOrders = useCustomerOrdering();
  const { formatTime } = useStoreTime();
  const timeZone = useRuntimeConfig().public.storeTimeZone as string;
  // RawBT solo existe en Android: en otro dispositivo el boton avisa en vez de no hacer nada.
  const isAndroid = import.meta.client && /android/i.test(navigator.userAgent);

  function where(order: TicketOrder) {
    if (order.serviceType === "MESA") return tableLabel(order.table ?? "");
    if (order.serviceType === "LLEVAR") return "Para llevar";
    return `Recoger ${formatTime(order.pickupSlot)}`;
  }
  function origin(order: TicketOrder) {
    if (order.source !== "WEB") return "Tomado en barra";
    return order.serviceType === "MESA" ? "Pedido por el cliente" : "Pedido web";
  }
  function dateText(iso: string) {
    return new Date(iso).toLocaleString("es-CO", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");
  }

  async function build(order: TicketOrder) {
    const s = result.value?.siteSettings;
    const p = new EscPos();

    p.align("center");
    const logo = await loadLogo();
    if (logo) p.image(logo.width, logo.height, logo.dots);
    p.bold(true).line(STORE_NAME).bold(false);
    for (const l of (s?.address ?? "").split("\n").map((x) => x.trim()).filter(Boolean)) p.line(l);
    if (s?.phone) p.line(s.phone);
    p.align("left").line(rule());

    p.bold(true).line(cols(`Pedido ${order.code}`, where(order))).bold(false);
    p.line(cols(dateText(order.paidAt ?? order.createdAt), origin(order)));
    p.line(rule());

    let gross = 0;
    for (const it of order.items) {
      const lineCents = it.priceCents * it.quantity;
      gross += lineCents;
      const [first, ...rest] = wrap(`${it.quantity} x ${it.name}`, COLS - 12);
      p.line(cols(first, money(lineCents)));
      for (const r of rest) p.line(`    ${r}`);
      for (const op of (it.options ?? []).filter((o) => !o.isDefault)) {
        const label = `${op.groupName ? `${op.groupName}: ` : ""}${op.name}${op.priceDeltaCents ? ` (+${money(op.priceDeltaCents)} c/u)` : ""}`;
        for (const l of wrap(label, COLS - 4)) p.line(`    ${l}`);
      }
    }
    if (order.packagingCents) {
      gross += order.packagingCents;
      p.line(cols("Empaque para llevar", money(order.packagingCents)));
    }
    p.line(rule());
    if (order.redemption || order.discount) {
      p.line(cols("Subtotal", money(gross)));
      if (order.redemption) p.line(cols(`Canje de sellos: ${order.redemption.name}`, `-${money(order.redemption.amountCents)}`));
      if (order.discount) p.line(cols(`Descuento: ${discountLabel(order.discount)}`, `-${money(order.discount.amountCents)}`));
      p.line(rule());
    }

    p.bold(true).double(true).line(cols("TOTAL", `$${money(order.totalCents)}`, COLS_DOUBLE)).double(false).bold(false);
    if (order.paidAt && order.paymentMethod) {
      p.line(cols("Pagado con", PAYMENT_LABELS[order.paymentMethod]));
      if (order.cashReceivedCents != null) {
        p.line(cols("Recibido", `$${money(order.cashReceivedCents)}`));
        p.bold(true).line(cols("Cambio", `$${money(order.changeCents ?? 0)}`)).bold(false);
      }
    } else {
      p.bold(true).line(cols("Pendiente de pago", "")).bold(false);
    }

    if (order.customer) {
      p.line(rule());
      p.bold(true).line(`${order.customer.name} · ${order.customer.customerCode}`).bold(false);
      if (order.redemption) p.line(`Canjeaste ${REWARD_THRESHOLD} sellos: ${order.redemption.name} gratis`.slice(0, COLS));
      if (order.customer.stampsBalance != null) p.line(`Llevas ${Math.min(order.customer.stampsBalance, REWARD_THRESHOLD)} de ${REWARD_THRESHOLD} sellos`);
    }

    p.align("center");
    p.qr(`${window.location.origin}/cuenta`);
    // "Pide desde la mesa" solo si los clientes pueden pedir (sin "Solo el personal" y con cola).
    p.line(customerOrders.value ? "Mira tus sellos y pide desde la mesa" : "Mira tus sellos en tu cuenta");
    p.feed(1);
    p.bold(true).line("¡Gracias por tu visita!").bold(false);
    const hours = (s?.schedule ?? []).map((l) => `${l.label} ${l.hours}`).join(" · ");
    for (const l of wrap(hours, COLS)) p.line(l);
    p.line("Este documento no es una factura");
    p.align("left").feed(3).cut();
    return p.toBase64();
  }

  /** Abre RawBT con el ticket. Devuelve un aviso si no se puede imprimir desde este dispositivo. */
  async function printTicket(order: TicketOrder): Promise<string | null> {
    if (!isAndroid) return "Para imprimir, usa la tablet Android con RawBT";
    const data = await build(order);
    const fallback = encodeURIComponent(RAWBT_PLAY_URL);
    window.location.href = `intent:base64,${data}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=${fallback};end;`;
    return null;
  }

  return { enabled, printTicket, buildTicket: build };
}
