import { internalEvents, INTERNAL_EVENTS, OrderDeliveredPayload } from "../../config/events";
import { LoyaltyTransaction, LOYALTY_RULES } from "./model";

/**
 * Suscripcion del modulo de fidelizacion al evento interno "pedido cerrado" (entregado y, si es
 * de mesa o barra, cobrado): lo servido sin pagar no suma sellos.
 * Se registra una vez al arrancar el servidor (ver src/index.ts).
 */
export function registerLoyaltyListeners() {
  internalEvents.on(INTERNAL_EVENTS.ORDER_COMPLETED, async (payload: OrderDeliveredPayload) => {
    if (!payload.customerId) return; // pedido sin cliente registrado: no hay a quien sumar sellos
    const units = payload.items.reduce((sum, item) => sum + item.quantity, 0);
    const stamps = units * LOYALTY_RULES.stampsPerUnit;
    if (stamps <= 0) return;

    await LoyaltyTransaction.create({
      customerId: payload.customerId,
      stamps,
      reason: "pedido",
      orderId: payload.orderId,
    });
  });
}
