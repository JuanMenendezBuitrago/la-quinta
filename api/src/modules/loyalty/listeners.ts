import { internalEvents, INTERNAL_EVENTS, OrderCancelledPayload, OrderDeliveredPayload } from "../../config/events";
import { LoyaltyTransaction } from "./model";
import { orderRedeemedStamps, refundOrderRedemption } from "./redemption";
import { stampsRule } from "../settings/resolvers";

/** Sellos que gana un pedido cerrado, segun la regla de Configuracion. */
export async function stampsForOrder(payload: OrderDeliveredPayload) {
  let units = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  // El producto que se llevo gratis con el canje de sellos no suma sello.
  if ((await orderRedeemedStamps(payload.orderId)) > 0) units -= 1;
  if (units <= 0) return 0; // solo el producto del canje: no gana nada
  const rule = await stampsRule();
  if (rule.mode === "PEDIDO") return rule.perOrder;
  if (rule.mode === "PRODUCTO") return units * rule.perItem;
  // Por importe: lo pagado en productos (ya sin canje ni descuento) y sin el recargo por empaque.
  const paidForProducts = payload.totalCents - (payload.packagingCents ?? 0);
  return Math.floor(Math.max(0, paidForProducts) / rule.amountCents);
}

/**
 * Suscripcion del modulo de fidelizacion al evento interno "pedido cerrado" (entregado y, si es
 * de mesa o barra, cobrado): lo servido sin pagar no suma sellos.
 * Se registra una vez al arrancar el servidor (ver src/index.ts).
 */
export function registerLoyaltyListeners() {
  internalEvents.on(INTERNAL_EVENTS.ORDER_COMPLETED, async (payload: OrderDeliveredPayload) => {
    if (!payload.customerId) return; // pedido sin cliente registrado: no hay a quien sumar sellos
    const stamps = await stampsForOrder(payload);
    if (stamps <= 0) return;

    await LoyaltyTransaction.create({
      customerId: payload.customerId,
      stamps,
      reason: "pedido",
      orderId: payload.orderId,
    });
  });

  // Pedido cancelado con el canje de sellos como descuento: los sellos vuelven al cliente.
  internalEvents.on(INTERNAL_EVENTS.ORDER_CANCELLED, async (payload: OrderCancelledPayload) => {
    if (!payload.customerId) return;
    await refundOrderRedemption(payload.customerId, payload.orderId, "Pedido cancelado: canje devuelto");
  });
}
