import { Types } from "mongoose";
import { revertConsumption } from "../inventory/stock";
import { consumeForOrder } from "../inventory/listeners";
import { assertRewardAvailable, redeemForOrder, refundOrderRedemption } from "../loyalty/redemption";
import { packagingFeeCents } from "../settings/resolvers";
import { User } from "../users/model";
import type { StaffRole } from "../users/model";
import { buildClosedPayload } from "./closed";
import { buildOrderLines, type OrderLineRequest } from "./create";
import { buildDiscount, buildRedemption, rebaseDiscount, type OrderDiscountInput, type OrderRedemptionInput } from "./discount";
import { isTakeaway, NO_PARTIAL_PAYMENTS, Order, type OrderDiscountDoc, type ServiceType } from "./model";

export interface StaffOrderUpdateInput {
  items: OrderLineRequest[];
  serviceType: ServiceType;
  table?: string | null;
  takeaway?: boolean | null;
  customerId?: string | null;
  note?: string | null;
  redemption?: OrderRedemptionInput | null;
  discount?: OrderDiscountInput | null;
}

/** El descuento que llega es el mismo que ya tenia el pedido (no se toco en el dialogo). */
function sameDiscount(current: OrderDiscountDoc | null | undefined, input: OrderDiscountInput) {
  if (!current || current.reason !== input.reason || (current.note || null) !== (input.note?.trim() || null)) return false;
  return current.percent ? current.percent === input.percent : !input.percent && current.amountCents === input.amountCents;
}

/**
 * Modifica un pedido antes de cobrarlo, como si se volviera a tomar: productos, mesa o para
 * llevar, cliente, nota, canje y descuento. El total se recalcula aqui.
 *
 * - Las lineas que no cambian conservan su precio de entonces (ver buildOrderLines).
 * - El descuento que no se toco se recalcula sobre el nuevo importe sin volver a pasar por el tope
 *   de barra (como en setOrderDiscounts); uno nuevo o cambiado, si.
 * - Sellos del canje: se restan al cliente nuevo o al ponerlo, y se devuelven al quitarlo o al
 *   cambiar de cliente.
 * - Si ya estaba servido (de mesa, sin cobrar), el stock ya se desconto: se deshace ese consumo y
 *   se vuelve a descontar con los productos nuevos.
 * - Los pedidos web para recoger (sin mesa ni "para llevar") no se modifican aqui.
 */
export async function updateStaffOrder(
  id: string,
  input: StaffOrderUpdateInput,
  staff: { id: string; role: StaffRole }
) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Pedido no encontrado");
  // Ni con partes ya cobradas (cuenta dividida): cambiaria lo que le toca a cada uno.
  const unpaid = { paidAt: { $exists: false }, completedAt: { $exists: false }, status: { $ne: "CANCELADO" }, ...NO_PARTIAL_PAYMENTS };
  const current = await Order.findOne({ _id: id, ...unpaid }).lean();
  if (!current) {
    const order = await Order.findById(id).select("code status paidAt payments").lean();
    if (!order) throw new Error("Pedido no encontrado");
    if (order.status === "CANCELADO") throw new Error(`El pedido ${order.code} esta cancelado`);
    if (!order.paidAt && order.payments?.length) throw new Error("Ya hay partes cobradas: deshazlas para modificar el pedido");
    throw new Error(`El pedido ${order.code} ya esta cobrado: no se puede modificar`);
  }
  if (!current.serviceType) throw new Error("Los pedidos web para recoger no se pueden modificar desde el panel");

  const table = input.table?.trim() || undefined;
  if (input.serviceType === "MESA" && !table) throw new Error("Indica el numero de mesa");
  const customerId = input.customerId || null;
  if (customerId && customerId !== current.customerId?.toString()) {
    if (!(await User.exists({ _id: customerId, deletedAt: { $exists: false } }))) throw new Error("Cliente no encontrado");
  }

  const { lines, totalCents } = await buildOrderLines(input.items, current.items);
  const takeaway = input.serviceType === "LLEVAR" || input.takeaway === true;
  // El recargo que se aplico al tomarlo se respeta; solo se mira la configuracion si pasa a llevar.
  const packagingCents = takeaway ? (isTakeaway(current) && current.packagingCents ? current.packagingCents : await packagingFeeCents()) : 0;
  const now = new Date();

  // Canje: si el producto canjeado sigue siendo el mismo (nombre y precio), se conserva quien lo
  // aplico y cuando; si no, se rehace sobre la linea elegida.
  let redemption = input.redemption ? buildRedemption(input.redemption, lines, staff, now) : null;
  if (redemption && current.redemption && redemption.name === current.redemption.name && redemption.amountCents === current.redemption.amountCents) {
    redemption = { ...current.redemption, lineIndex: redemption.lineIndex };
  }
  const baseCents = totalCents + packagingCents - (redemption?.amountCents ?? 0);
  const discount = input.discount
    ? sameDiscount(current.discount, input.discount)
      ? rebaseDiscount(current.discount!, baseCents)
      : buildDiscount(input.discount, baseCents, staff, now)
    : null;

  // Sellos, antes de guardar (y se deshace si el guardado falla).
  const oldCustomer = current.customerId?.toString() ?? null;
  const wasRedeemed = !!current.redemption;
  const redeems = !!redemption;
  if (redeems && !customerId) throw new Error("Para canjear sellos, identifica antes al cliente");
  const releaseOld = wasRedeemed && oldCustomer && (!redeems || oldCustomer !== customerId);
  const takeNew = redeems && (!wasRedeemed || oldCustomer !== customerId);
  if (releaseOld) await refundOrderRedemption(oldCustomer!, id, "Pedido modificado: canje devuelto", staff.id);
  if (takeNew) {
    try {
      await assertRewardAvailable(customerId!);
      await redeemForOrder(customerId!, id, staff.id);
    } catch (err) {
      if (releaseOld) await redeemForOrder(oldCustomer!, id, staff.id); // se deja como estaba
      throw err;
    }
  }

  const unset: Record<string, 1> = {};
  if (!redemption) unset.redemption = 1;
  if (!discount) unset.discount = 1;
  if (input.serviceType !== "MESA") unset.table = 1;
  const note = input.note?.trim() || undefined;
  if (!note) unset.note = 1;
  if (!customerId) unset.customerId = 1;
  // Atomico: si entretanto se cobro o lo cambio otra persona, no se pisa.
  const order = await Order.findOneAndUpdate(
    { _id: id, ...unpaid, updatedAt: current.updatedAt },
    {
      $set: {
        items: lines,
        serviceType: input.serviceType,
        ...(input.serviceType === "MESA" ? { table } : {}),
        ...(note ? { note } : {}),
        ...(customerId ? { customerId: new Types.ObjectId(customerId) } : {}),
        takeaway,
        packagingCents,
        ...(redemption ? { redemption } : {}),
        ...(discount ? { discount } : {}),
        totalCents: baseCents - (discount?.amountCents ?? 0),
        editedAt: now,
        editedByStaffId: new Types.ObjectId(staff.id),
        updatedAt: now,
      },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { new: true }
  );
  if (!order) {
    // Se deshacen los sellos en orden inverso.
    if (takeNew) await refundOrderRedemption(customerId!, id, "Modificacion no aplicada: canje devuelto", staff.id);
    if (releaseOld) await redeemForOrder(oldCustomer!, id, staff.id);
    throw new Error("El pedido acaba de cambiar: vuelve a intentarlo");
  }

  // Ya servido: el consumo de insumos se rehace con los productos nuevos.
  if (order.status === "ENTREGADO") {
    await revertConsumption(order._id);
    await consumeForOrder(await buildClosedPayload(order, "ENTREGADO", order.deliveredAt ?? now));
  }
  return order;
}
