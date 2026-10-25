import { DISCOUNT_REASONS, type DiscountReason, type OrderDiscountDoc } from "./model";
import type { StaffRole } from "../users/model";

/** Barra puede rebajar hasta este porcentaje del pedido; gestion, sin limite. */
export const BARRA_MAX_DISCOUNT_PERCENT = 20;

export interface OrderDiscountInput {
  percent?: number | null;
  amountCents?: number | null;
  reason: DiscountReason;
  note?: string | null;
}

/**
 * Descuento sobre un pedido de `grossCents` (productos + empaque, sin descuento): en porcentaje o
 * en pesos, nunca mas que el propio pedido. Con motivo obligatorio ("Otro" pide una nota) y con
 * el tope de barra comprobado aqui, en el servidor.
 */
export function buildDiscount(
  input: OrderDiscountInput,
  grossCents: number,
  staff: { id: string; role: StaffRole },
  at: Date
): OrderDiscountDoc {
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
