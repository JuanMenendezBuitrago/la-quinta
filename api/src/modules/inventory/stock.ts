import { Types } from "mongoose";
import { EVENTS, pubsub } from "../../config/pubsub";
import { StockMovement, StockReason, Supply, SupplyDoc } from "./model";

export interface MovementData {
  supplyId: Types.ObjectId | string;
  delta: number;
  reason: StockReason;
  orderId?: Types.ObjectId | string;
  staffId?: string;
  note?: string;
  countedQty?: number;
}

/** Redondeo a 2 decimales: evita saldos como 999.9999999 tras sumar gramos decimales. */
export function roundQty(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Registra un movimiento en el ledger y actualiza el saldo cacheado del insumo.
 * El movimiento se crea primero: si falla (p. ej. consumo ya descontado para ese pedido),
 * el saldo no se toca. Si el proceso muriera entre los dos pasos, recalc-stock lo corrige.
 */
export async function applyMovement(data: MovementData): Promise<SupplyDoc> {
  const delta = roundQty(data.delta);
  await StockMovement.create({ ...data, delta });
  const supply = await Supply.findByIdAndUpdate(data.supplyId, { $inc: { stock: delta } }, { new: true }).lean();
  if (!supply) throw new Error("Insumo no encontrado");

  // Aviso solo al cruzar el minimo (no en cada movimiento mientras siga bajo minimo).
  const before = roundQty(supply.stock - delta);
  if (supply.active && before > supply.minStock && supply.stock <= supply.minStock) {
    await pubsub.publish(EVENTS.INVENTORY_LOW, {
      inventoryAlerts: {
        supplyId: supply._id.toString(),
        name: supply.name,
        stock: supply.stock,
        minStock: supply.minStock,
        unit: supply.unit,
      },
    });
  }
  return supply;
}

/**
 * Deshace el consumo automatico de un pedido: borra sus movimientos de "consumo" y devuelve esas
 * cantidades al saldo de cada insumo. Para un pedido que se elimina o que se modifica despues de
 * entregarlo (luego se vuelve a descontar con sus productos nuevos).
 */
export async function revertConsumption(orderId: Types.ObjectId | string) {
  const movements = await StockMovement.find({ orderId, reason: "consumo" }).select("supplyId delta").lean();
  const bySupply = new Map<string, number>();
  for (const m of movements) bySupply.set(m.supplyId.toString(), (bySupply.get(m.supplyId.toString()) ?? 0) + m.delta);
  await StockMovement.deleteMany({ orderId, reason: "consumo" });
  for (const [supplyId, total] of bySupply) {
    await Supply.updateOne({ _id: supplyId }, { $inc: { stock: -roundQty(total) } });
  }
}
