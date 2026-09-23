import { internalEvents, INTERNAL_EVENTS, OrderDeliveredPayload } from "../../config/events";
import { isDuplicateKeyError, Recipe } from "./model";
import { applyMovement, roundQty } from "./stock";

/**
 * Descuento automatico de insumos al entregar un pedido, segun la receta de cada producto.
 * Los productos sin receta no descuentan nada: el inventario se puede ir montando poco a poco.
 */
export async function consumeForOrder(payload: OrderDeliveredPayload) {
  const menuItemIds = payload.items.map((i) => i.menuItemId).filter(Boolean);
  if (!menuItemIds.length) return;
  const recipes = await Recipe.find({ menuItemId: { $in: menuItemIds } }).lean();
  if (!recipes.length) return;

  // Vasos, tapas...: los pedidos web son para recoger; los del personal, si son "para llevar".
  const takeaway = payload.source === "STAFF" ? payload.serviceType === "LLEVAR" : true;

  const totals = new Map<string, number>();
  for (const item of payload.items) {
    const recipe = recipes.find((r) => r.menuItemId.toString() === item.menuItemId);
    for (const line of recipe?.lines ?? []) {
      if (line.onlyTakeaway && !takeaway) continue;
      const key = line.supplyId.toString();
      totals.set(key, (totals.get(key) ?? 0) + line.qty * item.quantity);
    }
  }

  for (const [supplyId, qty] of totals) {
    if (roundQty(qty) <= 0) continue;
    try {
      await applyMovement({ supplyId, delta: -qty, reason: "consumo", orderId: payload.orderId });
    } catch (err) {
      if (isDuplicateKeyError(err)) continue; // ya descontado para este pedido
      // eslint-disable-next-line no-console
      console.error(`[inventory] no se pudo descontar el insumo ${supplyId} del pedido ${payload.code}:`, err);
    }
  }
}

/** Se registra una vez al arrancar el servidor (ver src/index.ts). */
export function registerInventoryListeners() {
  internalEvents.on(INTERNAL_EVENTS.ORDER_DELIVERED, (payload: OrderDeliveredPayload) => {
    consumeForOrder(payload).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[inventory] error al descontar el pedido ${payload.code}:`, err);
    });
  });
}
