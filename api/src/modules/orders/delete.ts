import { Types } from "mongoose";
import { StockMovement } from "../inventory/model";
import { revertConsumption } from "../inventory/stock";
import { LoyaltyTransaction } from "../loyalty/model";
import { Review } from "../reviews/model";
import { CustomerPhoto, removePhotoFile } from "../photos/model";
import { UPLOAD_DIR } from "../uploads/router";
import { Order } from "./model";

/**
 * Borra un pedido del historial (solo gestion) como si nunca hubiera existido: se devuelve al
 * stock lo que consumio, desaparecen sus sellos (los ganados y el canje, asi que el canje vuelve
 * al saldo del cliente), su opinion y las fotos de cliente hechas sobre el. Es la unica
 * excepcion a "el ledger nunca se borra": un pedido borrado no debe dejar movimientos huerfanos.
 * Los cierres de caja ya hechos no se tocan (son un registro de lo que se conto ese dia).
 */
export async function deleteClosedOrder(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Pedido no encontrado");
  const order = await Order.findById(id).lean();
  if (!order) throw new Error("Pedido no encontrado");
  const closed = order.status === "CANCELADO" || (order.status === "ENTREGADO" && !!order.completedAt);
  if (!closed) throw new Error("Solo se pueden eliminar pedidos del historial (cerrados o cancelados)");

  // Primero se borra el pedido: si algo falla despues, no queda un pedido a medio deshacer en la
  // lista, y recalc-stock corrige el saldo cacheado si hiciera falta.
  await Order.deleteOne({ _id: order._id });

  await revertConsumption(order._id);
  await StockMovement.deleteMany({ orderId: order._id }); // por si quedara algun otro con su id

  await LoyaltyTransaction.deleteMany({ orderId: order._id });
  await Review.deleteMany({ orderId: order._id });
  const photos = await CustomerPhoto.find({ orderId: order._id }).select("url").lean();
  await CustomerPhoto.deleteMany({ orderId: order._id });
  for (const p of photos) await removePhotoFile(p.url, UPLOAD_DIR);

  return order._id.toString();
}
