import { DISCOUNT_REASONS, type DiscountReason, type OrderDiscountDoc, type OrderLineDoc, type OrderRedemptionDoc } from "./model";
import type { StaffRole } from "../users/model";

/** Barra puede rebajar hasta este porcentaje del pedido; gestion, sin limite. */
export const BARRA_MAX_DISCOUNT_PERCENT = 20;

export interface OrderDiscountInput {
  percent?: number | null;
  amountCents?: number | null;
  reason: DiscountReason;
  note?: string | null;
}

/** Canje de sellos: la linea (posicion en items) del producto gratis; sin ella, la mas barata. */
export interface OrderRedemptionInput {
  lineIndex?: number | null;
}

/**
 * Descuento sobre un pedido de `grossCents` (productos + empaque - canje de sellos, sin descuento):
 * en porcentaje o en pesos, nunca mas que eso. Con motivo obligatorio ("Otro" pide una nota) y con
 * el tope de barra comprobado aqui, en el servidor.
 */
export function buildDiscount(
  input: OrderDiscountInput,
  grossCents: number,
  staff: { id: string; role: StaffRole },
  at: Date
): OrderDiscountDoc {
  if (input.reason === "CANJE") throw new Error("El canje de sellos va aparte del descuento");
  const hasPercent = input.percent !== null && input.percent !== undefined;
  const hasAmount = input.amountCents !== null && input.amountCents !== undefined;
  if (hasPercent === hasAmount) throw new Error("Indica el descuento en porcentaje o en pesos");
  if (!DISCOUNT_REASONS.includes(input.reason)) throw new Error("Motivo de descuento no valido");
  const note = input.note?.trim().slice(0, 120) || undefined;
  if (input.reason === "OTRO" && !note) throw new Error("Explica el motivo del descuento");

  let amountCents: number;
  if (hasPercent) {
    const percent = input.percent!;
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error("El porcentaje debe estar entre 1 y 100");
    amountCents = Math.round((grossCents * percent) / 100);
  } else {
    amountCents = input.amountCents!;
    if (!Number.isInteger(amountCents) || amountCents < 1) throw new Error("El descuento debe ser de al menos 1 peso");
    if (amountCents > grossCents) throw new Error("El descuento no puede ser mayor que el pedido");
  }
  if (amountCents < 1) throw new Error("El pedido es demasiado pequeño para ese descuento");
  if (staff.role !== "gestion" && amountCents * 100 > grossCents * BARRA_MAX_DISCOUNT_PERCENT) {
    throw new Error(`Desde barra el descuento puede ser de hasta el ${BARRA_MAX_DISCOUNT_PERCENT} %: para más, pide a gestión`);
  }

  return {
    percent: hasPercent ? input.percent! : null,
    amountCents,
    reason: input.reason,
    note,
    staffId: staff.id as any,
    at,
  };
}

/**
 * Canje de sellos: una unidad de una linea del pedido sale gratis (la elegida o, si no, la mas
 * barata). Sin tope de barra, porque el limite lo ponen los sellos; los sellos los comprueba y los
 * resta quien lo aplica (ver loyalty/redemption.ts).
 */
export function buildRedemption(
  input: OrderRedemptionInput,
  lines: Pick<OrderLineDoc, "name" | "priceCents">[],
  staff: { id: string },
  at: Date
): OrderRedemptionDoc {
  // Sin eleccion, el producto mas barato que se cobre (uno a 0 no tiene nada que canjear).
  let lineIndex = input.lineIndex ?? -1;
  if (lineIndex === -1) {
    lines.forEach((line, i) => {
      if (line.priceCents >= 1 && (lineIndex === -1 || line.priceCents < lines[lineIndex].priceCents)) lineIndex = i;
    });
  }
  const line = Number.isInteger(lineIndex) && lineIndex >= 0 ? lines[lineIndex] : undefined;
  if (!line) throw new Error("Elige el producto que se canjea");
  if (line.priceCents < 1) throw new Error(`${line.name} ya es gratis: elige otro producto para el canje`);
  return { lineIndex, name: line.name, amountCents: line.priceCents, staffId: staff.id as any, at };
}

/**
 * El descuento ya aplicado, sobre un nuevo `grossCents` (p. ej. al poner o quitar el canje): un
 * porcentaje se recalcula y un importe fijo no pasa de lo que queda. Sin volver a mirar el tope de
 * barra, que se comprobo al aplicarlo quien lo aplico. null si ya no queda nada que descontar.
 */
export function rebaseDiscount(discount: OrderDiscountDoc, grossCents: number): OrderDiscountDoc | null {
  const amountCents = discount.percent
    ? Math.round((grossCents * discount.percent) / 100)
    : Math.min(discount.amountCents, grossCents);
  return amountCents >= 1 ? { ...discount, amountCents } : null;
}
