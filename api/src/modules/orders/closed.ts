import type { OrderClosedPayload } from "../../config/events";
import { User } from "../users/model";
import { DISCOUNT_REASON_LABELS, isTakeaway, type OrderDoc } from "./model";

/**
 * Instantanea de un pedido para los eventos internos ORDER_DELIVERED / ORDER_COMPLETED / ORDER_CANCELLED.
 * `closedAt` es null cuando no se conoce (pedidos cerrados antes de que se registrara
 * la fecha del cambio de estado).
 */
export async function buildClosedPayload<S extends OrderClosedPayload["status"]>(
  order: Pick<
    OrderDoc,
    "_id" | "code" | "customerId" | "items" | "totalCents" | "packagingCents" | "discount" | "redemption" | "takeaway" | "pickupSlot" | "source" | "serviceType" | "table" | "paidAt" | "paymentMethod"
  >,
  status: S,
  closedAt: Date | null
): Promise<OrderClosedPayload & { status: S }> {
  const customer = order.customerId
    ? await User.findById(order.customerId).select("name customerCode").lean()
    : null;
  return {
    status,
    orderId: order._id.toString(),
    customerId: order.customerId?.toString() ?? null,
    totalCents: order.totalCents,
    packagingCents: order.packagingCents ?? 0,
    // Canje de sellos y descuento juntos ("Canje de sellos: Latte · Otro: cumpleaños de Ana").
    discountCents: (order.redemption?.amountCents ?? 0) + (order.discount?.amountCents ?? 0),
    discountReason: [
      order.redemption ? `${DISCOUNT_REASON_LABELS.CANJE}: ${order.redemption.name}` : "",
      order.discount ? `${DISCOUNT_REASON_LABELS[order.discount.reason]}${order.discount.note ? `: ${order.discount.note}` : ""}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    takeaway: isTakeaway(order),
    code: order.code,
    customerName: customer?.name ?? "",
    customerCode: customer?.customerCode ?? "",
    items: order.items.map((i) => ({
      menuItemId: i.menuItemId.toString(),
      name: i.name, quantity: i.quantity,
      priceCents: i.priceCents,
      options: (i.options ?? []).filter((o) => !o.isDefault).map((o) => o.name),
      optionSwaps: (i.options ?? [])
        .filter((o) => !o.isDefault)
        .map((o) => ({ fromOptionId: o.defaultOptionId?.toString() ?? null, toOptionId: o.optionId.toString() })),
    })),
    pickupSlot: order.pickupSlot.toISOString(),
    source: order.source ?? "WEB",
    serviceType: order.serviceType ?? null,
    table: order.table ?? null,
    closedAt: closedAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentMethod: order.paymentMethod ?? null,
  };
}
