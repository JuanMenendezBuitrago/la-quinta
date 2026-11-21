import type { OrderDoc, OrderPaymentUnitsDoc, SplitMode } from "./model";

/**
 * Cobro dividido: cada persona paga su parte, por productos (lo que tomo), a partes iguales o la
 * cantidad que diga (libre).
 * Calculos puros, sin base de datos; la cola del personal (web/composables/useSplitBill.ts) repite
 * los mismos para la vista previa, pero el importe que vale es el de aqui.
 */
type SplitOrder = Pick<OrderDoc, "items" | "totalCents" | "redemption" | "payments" | "split">;

export function paidCents(order: Pick<OrderDoc, "payments">) {
  return (order.payments ?? []).reduce((sum, p) => sum + p.amountCents, 0);
}

export function remainingCents(order: Pick<OrderDoc, "payments" | "totalCents">) {
  return Math.max(order.totalCents - paidCents(order), 0);
}

/** Unidades ya pagadas de cada linea (por posicion en items). */
export function paidUnits(order: Pick<OrderDoc, "items" | "payments">) {
  const paid = order.items.map(() => 0);
  for (const p of order.payments ?? []) for (const u of p.units ?? []) if (u.lineIndex < paid.length) paid[u.lineIndex] += u.quantity;
  return paid;
}

/**
 * Precio de cada unidad de cada linea. La unidad canjeada (la ultima de su linea: las que se pagan
 * van antes) vale 0, asi que quien se lleva el producto gratis no lo paga.
 */
function unitPrices(order: Pick<OrderDoc, "items" | "redemption">) {
  return order.items.map((line, i) =>
    Array.from({ length: line.quantity }, (_, u) => (order.redemption?.lineIndex === i && u === line.quantity - 1 ? 0 : line.priceCents))
  );
}

/**
 * Importe de unas unidades: su precio, con el descuento y el empaque repartidos en proporcion
 * (total del pedido / suma de las unidades). Si con ellas ya no queda nada por pagar, es justo lo
 * que falta: la ultima parte se lleva el redondeo.
 */
export function unitsAmount(order: SplitOrder, units: OrderPaymentUnitsDoc[]) {
  const prices = unitPrices(order);
  const paid = paidUnits(order);
  const taken = order.items.map(() => 0);
  for (const u of units) {
    if (!Number.isInteger(u.lineIndex) || !order.items[u.lineIndex]) throw new Error("Ese producto no esta en el pedido");
    if (!Number.isInteger(u.quantity) || u.quantity < 1) throw new Error("Cantidad no valida");
    taken[u.lineIndex] += u.quantity;
  }
  if (!taken.some(Boolean)) throw new Error("Elige lo que paga esta persona");

  let selected = 0;
  for (let i = 0; i < order.items.length; i++) {
    if (paid[i] + taken[i] > order.items[i].quantity) throw new Error(`${order.items[i].name}: ya esta pagado`);
    for (let u = paid[i]; u < paid[i] + taken[i]; u++) selected += prices[i][u];
  }
  const completes = order.items.every((line, i) => paid[i] + taken[i] === line.quantity);
  if (completes) return { amountCents: remainingCents(order), completes };

  const allUnits = prices.flat().reduce((a, b) => a + b, 0);
  const amountCents = allUnits ? Math.round((selected * order.totalCents) / allUnits) : 0;
  return { amountCents: Math.min(amountCents, remainingCents(order)), completes: false };
}

/** Importe de la siguiente parte a partes iguales: lo que falta entre las personas que faltan. */
export function equalAmount(order: SplitOrder, parts: number) {
  const done = order.payments?.length ?? 0;
  if (!Number.isInteger(parts) || parts < 2 || parts > MAX_SPLIT_PARTS) throw new Error(`Divide entre 2 y ${MAX_SPLIT_PARTS} personas`);
  if (parts <= done) throw new Error(`Ya han pagado ${done}: divide entre más personas`);
  const remaining = remainingCents(order);
  const completes = parts - done === 1;
  return { amountCents: completes ? remaining : Math.round(remaining / (parts - done)), completes };
}

export const MAX_SPLIT_PARTS = 12;

/** Cantidad libre: lo que diga esa persona, sin pasar de lo que falta (si es justo eso, es la ultima). */
export function freeAmount(order: SplitOrder, amountCents: number) {
  const remaining = remainingCents(order);
  if (!Number.isInteger(amountCents) || amountCents < 1) throw new Error("Escribe cuánto paga esta persona");
  if (amountCents > remaining) throw new Error("Esa cantidad es más de lo que falta");
  if ((order.payments?.length ?? 0) + 1 >= MAX_SPLIT_PARTS && amountCents < remaining) {
    throw new Error(`Como mucho ${MAX_SPLIT_PARTS} partes: esta tiene que ser lo que falta`);
  }
  return { amountCents, completes: amountCents === remaining };
}

const MODE_TAKEN: Record<SplitMode, string> = {
  PRODUCTOS: "La cuenta ya se esta dividiendo por productos",
  IGUALES: "La cuenta ya se esta dividiendo a partes iguales",
  LIBRE: "La cuenta ya se esta dividiendo por cantidades",
};

/** Lo que paga la siguiente persona, segun el modo elegido (que no cambia con partes ya cobradas). */
export function nextPartAmount(
  order: SplitOrder,
  input: { units?: OrderPaymentUnitsDoc[] | null; parts?: number | null; amountCents?: number | null }
) {
  const given = [!!input.units?.length, input.parts != null, input.amountCents != null].filter(Boolean).length;
  if (given > 1) throw new Error("Divide por productos, a partes iguales o por cantidad, solo una");
  if (!given) throw new Error("Elige lo que paga esta persona, entre cuantas se divide o cuanto paga");
  const mode: SplitMode = input.units?.length ? "PRODUCTOS" : input.parts != null ? "IGUALES" : "LIBRE";
  if (order.payments?.length && order.split && order.split.mode !== mode) throw new Error(MODE_TAKEN[order.split.mode]);
  const result =
    mode === "PRODUCTOS" ? unitsAmount(order, input.units!) : mode === "IGUALES" ? equalAmount(order, input.parts!) : freeAmount(order, input.amountCents!);
  if (result.amountCents < 1) throw new Error("Esa parte no tiene nada que pagar: añádela a la de otra persona");
  return { ...result, mode };
}
