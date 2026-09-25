import { Types } from "mongoose";
import { internalEvents, INTERNAL_EVENTS, OrderDeliveredPayload } from "../../config/events";
import { isDuplicateKeyError, OptionSupply, Recipe, RecipeLineDoc } from "./model";
import { applyMovement, roundQty } from "./stock";

/**
 * Descuento automatico de insumos al entregar un pedido, segun la receta de cada producto.
 * Los productos sin receta no descuentan nada: el inventario se puede ir montando poco a poco.
 */
export async function consumeForOrder(payload: OrderDeliveredPayload) {
  const menuItemIds = payload.items.map((i) => i.menuItemId).filter(Boolean);
  if (!menuItemIds.length) return;
  const recipes = await Recipe.find({ menuItemId: { $in: menuItemIds } }).lean();
  // Sin recetas aun puede haber algo que descontar: una adicion (leche en un te) se suma sola.
  const hasSwaps = payload.items.some((i) => i.optionSwaps?.length);
  if (!recipes.length && !hasSwaps) return;

  // Vasos, tapas...: "para llevar" y los pedidos web para recoger (sin servicio); no en mesa.
  const takeaway = payload.serviceType ? payload.serviceType === "LLEVAR" : true;

  // Opciones distintas de la de por defecto (un Latte con avena): que insumo es cada una.
  const swapOptionIds = payload.items.flatMap((i) => (i.optionSwaps ?? []).flatMap((s) => [s.fromOptionId, s.toOptionId]));
  const optionSupplies = swapOptionIds.length
    ? await OptionSupply.find({ optionId: { $in: swapOptionIds.filter(Boolean) } }).lean()
    : [];
  const supplyOfOption = new Map(
    optionSupplies.map((o) => [o.optionId.toString(), { supplyId: o.supplyId.toString(), qty: o.qty ?? null }])
  );

  const totals = new Map<string, number>();
  for (const item of payload.items) {
    const recipe = recipes.find((r) => r.menuItemId.toString() === item.menuItemId);
    const lines = withOptionSwaps(recipe?.lines ?? [], item.optionSwaps ?? [], supplyOfOption);
    for (const line of lines) {
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

/**
 * Receta de una unidad con las opciones elegidas (ver OptionSupply):
 * - Sustituye: si la receta lleva el insumo de la opcion por defecto, se cambia por el de la
 *   elegida en la misma cantidad. Si la elegida no tiene insumo, el de por defecto no se
 *   descuenta (mejor no gastar nada que gastar la leche equivocada).
 * - Anade: si no hay nada que sustituir (adicion sin opcion por defecto, o la de por defecto no
 *   tiene insumo, como el agua de un jugo), se suma la cantidad de la elegida, si la tiene.
 */
export function withOptionSwaps(
  lines: RecipeLineDoc[],
  swaps: { fromOptionId: string | null; toOptionId: string }[],
  supplyOfOption: Map<string, { supplyId: string; qty: number | null }>
): RecipeLineDoc[] {
  let result = lines;
  for (const swap of swaps) {
    const from = swap.fromOptionId ? supplyOfOption.get(swap.fromOptionId)?.supplyId : undefined;
    const to = supplyOfOption.get(swap.toOptionId);
    if (from && result.some((line) => line.supplyId.toString() === from)) {
      result = result.flatMap((line) => {
        if (line.supplyId.toString() !== from) return [line];
        return to ? [{ ...line, supplyId: new Types.ObjectId(to.supplyId) }] : [];
      });
    } else if (to?.qty) {
      result = [...result, { supplyId: new Types.ObjectId(to.supplyId), qty: to.qty, onlyTakeaway: false }];
    }
  }
  return result;
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
