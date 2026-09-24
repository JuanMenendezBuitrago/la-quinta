import { internalEvents, INTERNAL_EVENTS } from "../../config/events";
import { buildClosedPayload } from "./closed";
import { Order } from "./model";

/**
 * Cierra el pedido si ya toca: entregado y, si es de mesa o barra, cobrado. El cierre es un
 * update atomico sobre completedAt, asi que aunque entregar y cobrar ocurran a la vez (dos
 * personas, dos peticiones), solo una lo consigue y ORDER_COMPLETED sale una unica vez: los
 * sellos no se suman dos veces ni la fila se escribe dos veces en la hoja.
 */
export async function tryComplete(orderId: string) {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: "ENTREGADO",
      completedAt: { $exists: false },
      $or: [{ serviceType: { $ne: "MESA" } }, { paidAt: { $exists: true } }],
    },
    { $set: { completedAt: new Date() } },
    { new: true }
  );
  if (!order) return null;

  const payload = await buildClosedPayload(order, "ENTREGADO", order.deliveredAt ?? order.updatedAt);
  internalEvents.emit(INTERNAL_EVENTS.ORDER_COMPLETED, payload);
  return order;
}
