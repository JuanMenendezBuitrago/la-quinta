import { internalEvents, INTERNAL_EVENTS, OrderDeliveredPayload } from "../../config/events";
import { LoyaltyTransaction, LOYALTY_RULES } from "./model";

/**
 * Suscripcion del modulo de fidelizacion al evento interno "pedido entregado".
 * Se registra una vez al arrancar el servidor (ver src/index.ts).
 */
export function registerLoyaltyListeners() {
  internalEvents.on(INTERNAL_EVENTS.ORDER_DELIVERED, async (payload: OrderDeliveredPayload) => {
    const stamps = Math.floor(payload.totalCents / LOYALTY_RULES.pesosPerStamp);
    if (stamps <= 0) return;

    await LoyaltyTransaction.create({
      customerId: payload.customerId,
      stamps,
      reason: "pedido",
      orderId: payload.orderId,
    });
  });
}
