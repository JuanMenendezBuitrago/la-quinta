import { Types } from "mongoose";
import { LoyaltyTransaction, LOYALTY_RULES } from "./model";
import { rewardThresholdStamps } from "../settings/resolvers";

/**
 * Canje de la recompensa como descuento de un pedido ("Canje de sellos"). El descuento vive en
 * "orders", pero los sellos tienen que estar disponibles en el momento de aplicarlo: por eso
 * "orders" llama aqui directamente en vez de por el bus de eventos (que no devuelve respuesta).
 *
 * El ledger no se edita: canjear es una fila "canje" de -10 con el pedido, y devolverlo (quitar el
 * descuento o cancelar el pedido) otra "canje" de +10 con el mismo pedido. Lo que el pedido tiene
 * retenido es la suma de sus filas de canje, asi que ambas operaciones son idempotentes.
 */

export async function stampsBalance(customerId: string) {
  const [row] = await LoyaltyTransaction.aggregate<{ total: number }>([
    { $match: { customerId: new Types.ObjectId(customerId) } },
    { $group: { _id: null, total: { $sum: "$stamps" } } },
  ]);
  return row?.total ?? 0;
}

/** Sellos que el pedido tiene canjeados ahora mismo (0 o la recompensa). */
export async function orderRedeemedStamps(orderId: string) {
  const [row] = await LoyaltyTransaction.aggregate<{ total: number }>([
    { $match: { orderId: new Types.ObjectId(orderId), reason: "canje" } },
    { $group: { _id: null, total: { $sum: "$stamps" } } },
  ]);
  return -(row?.total ?? 0);
}

export async function assertRewardAvailable(customerId: string) {
  const [balance, threshold] = await Promise.all([stampsBalance(customerId), rewardThresholdStamps()]);
  if (balance < threshold) {
    throw new Error(`El cliente tiene ${balance} de ${threshold} sellos: todavia no puede canjear`);
  }
}

/** Resta la recompensa a cuenta de ese pedido, si no la tiene ya. Comprobar antes el saldo. */
export async function redeemForOrder(customerId: string, orderId: string, staffId: string) {
  if ((await orderRedeemedStamps(orderId)) > 0) return;
  await LoyaltyTransaction.create({
    customerId,
    stamps: -(await rewardThresholdStamps()),
    reason: "canje",
    orderId,
    staffId,
    note: "Canje en el pedido",
  });
}

/**
 * Sello por una foto de cliente aprobada. Quien la aprueba (modules/photos) decide si toca:
 * uno por producto y pedido, que lleva la cuenta en la propia foto (stampAwarded).
 */
export async function awardPhotoStamp(customerId: string, orderId: string, menuItemName: string, staffId: string) {
  await LoyaltyTransaction.create({
    customerId,
    stamps: LOYALTY_RULES.stampsPerApprovedPhoto,
    reason: "foto",
    orderId,
    staffId,
    note: `Foto aprobada: ${menuItemName}`.slice(0, 200),
  });
}

/** Devuelve los sellos canjeados en ese pedido, si los hay (se quito el descuento o se cancelo). */
export async function refundOrderRedemption(
  customerId: string,
  orderId: string,
  note: string,
  staffId?: string
) {
  const held = await orderRedeemedStamps(orderId);
  if (held <= 0) return;
  await LoyaltyTransaction.create({
    customerId,
    stamps: held,
    reason: "canje",
    orderId,
    ...(staffId ? { staffId } : {}),
    note,
  });
}
