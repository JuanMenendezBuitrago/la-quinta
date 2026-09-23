/**
 * Recalcula el stock cacheado de cada insumo sumando su ledger de movimientos. Solo hace falta
 * si alguna vez se desincroniza (p. ej. la API se cayo entre crear un movimiento y aplicar su
 * $inc). Es idempotente: muestra y corrige solo los insumos cuyo saldo no cuadra.
 *
 * Uso: npm run recalc-stock                              (desarrollo)
 *      docker compose exec api node dist/scripts/recalc-stock.js
 */
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { StockMovement, Supply } from "../modules/inventory/model";

async function recalcStock() {
  await connectMongo();
  const totals = await StockMovement.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
    { $group: { _id: "$supplyId", total: { $sum: "$delta" } } },
  ]);
  const totalById = new Map(totals.map((t) => [t._id.toString(), Math.round(t.total * 100) / 100]));

  let fixed = 0;
  for (const supply of await Supply.find().lean()) {
    const expected = totalById.get(supply._id.toString()) ?? 0;
    if (Math.abs(expected - supply.stock) < 0.005) continue;
    // eslint-disable-next-line no-console
    console.log(`[recalc-stock] ${supply.name}: ${supply.stock} -> ${expected} ${supply.unit}`);
    await Supply.updateOne({ _id: supply._id }, { $set: { stock: expected } });
    fixed++;
  }
  // eslint-disable-next-line no-console
  console.log(`[recalc-stock] ${fixed ? `${fixed} insumo(s) corregido(s)` : "todo cuadra"}`);
}

recalcStock()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[recalc-stock] error:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
