/**
 * Carga en el inventario los insumos y las recetas de la carta (datos en data/recetas-carta.ts).
 *
 * - Insumos: crea los que faltan (por nombre, sin tildes ni mayusculas). No toca los que ya
 *   existen ni su stock: el stock real se anota despues con un conteo desde el panel.
 * - Recetas: solo rellena los productos que aun no tienen receta, para no pisar lo que se haya
 *   ajustado a mano en el panel. Con --overwrite sustituye tambien las existentes.
 * - Con --dry-run solo muestra lo que haria, sin escribir nada.
 *
 * Uso: npm run import-recipes [-- --dry-run] [-- --overwrite]           (desarrollo)
 *      docker compose exec api node dist/scripts/import-recipes.js [--dry-run] [--overwrite]
 */
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { MenuItem } from "../modules/menu/model";
import { Recipe, Supply, supplyNameKey } from "../modules/inventory/model";
import { RECIPES, SUPPLIES, WITHOUT_RECIPE } from "./data/recetas-carta";

const dryRun = process.argv.includes("--dry-run");
const overwrite = process.argv.includes("--overwrite");
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log("[import-recipes]", ...args);

/** Comprueba los datos antes de tocar la base: nombres repetidos, insumos inexistentes... */
function validateData() {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const s of SUPPLIES) {
    const key = supplyNameKey(s.name);
    if (keys.has(key)) errors.push(`insumo repetido: ${s.name}`);
    keys.add(key);
  }
  for (const [product, lines] of Object.entries(RECIPES)) {
    const seen = new Set<string>();
    for (const [supply, qty, onlyTakeaway] of lines) {
      if (!keys.has(supplyNameKey(supply))) errors.push(`${product}: el insumo «${supply}» no esta en SUPPLIES`);
      if (!(qty > 0)) errors.push(`${product}: cantidad no valida para «${supply}»`);
      const lineKey = `${supplyNameKey(supply)}:${!!onlyTakeaway}`;
      if (seen.has(lineKey)) errors.push(`${product}: «${supply}» esta repetido`);
      seen.add(lineKey);
    }
  }
  if (errors.length) throw new Error(`datos no validos:\n  - ${errors.join("\n  - ")}`);
}

async function importRecipes() {
  validateData();
  await connectMongo();
  if (dryRun) log("modo prueba (--dry-run): no se escribe nada");

  // --- Insumos ---
  const existing = new Map((await Supply.find().lean()).map((s) => [s.nameKey, s]));
  let created = 0;
  for (const seed of SUPPLIES) {
    const key = supplyNameKey(seed.name);
    const current = existing.get(key);
    if (current) {
      if (current.unit !== seed.unit) {
        throw new Error(`«${seed.name}» ya existe en ${current.unit} y los datos lo piden en ${seed.unit}`);
      }
      continue;
    }
    created++;
    if (!dryRun) {
      const doc = await Supply.create({ ...seed, nameKey: key, minStock: 0, stock: 0, active: true });
      existing.set(key, doc.toObject());
    }
  }
  log(`insumos: ${created} nuevos, ${SUPPLIES.length - created} ya existian`);

  // --- Recetas ---
  const items = await MenuItem.find().select("name").lean();
  const itemsByName = new Map<string, typeof items>();
  for (const item of items) {
    const key = supplyNameKey(item.name);
    itemsByName.set(key, [...(itemsByName.get(key) ?? []), item]);
  }
  const withRecipe = new Set((await Recipe.find().select("menuItemId").lean()).map((r) => r.menuItemId.toString()));

  let written = 0;
  let kept = 0;
  const notInMenu: string[] = [];
  const covered = new Set<string>();
  for (const [product, lines] of Object.entries(RECIPES)) {
    const matches = itemsByName.get(supplyNameKey(product)) ?? [];
    if (!matches.length) notInMenu.push(product);
    for (const item of matches) {
      const id = item._id.toString();
      covered.add(id);
      if (withRecipe.has(id) && !overwrite) {
        kept++;
        continue;
      }
      written++;
      if (dryRun) continue;
      await Recipe.findOneAndUpdate(
        { menuItemId: item._id },
        {
          $set: {
            lines: lines.map(([supply, qty, onlyTakeaway]) => ({
              supplyId: existing.get(supplyNameKey(supply))!._id,
              qty,
              onlyTakeaway: !!onlyTakeaway,
            })),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }
  log(`recetas: ${written} ${dryRun ? "se escribirian" : "escritas"}, ${kept} ya tenian receta (sin tocar${overwrite ? "" : "; usa --overwrite para sustituirlas"})`);

  if (notInMenu.length) log(`AVISO: en los datos pero no en la carta: ${notInMenu.join(", ")}`);
  const intentionallyEmpty = new Set(Object.keys(WITHOUT_RECIPE).map(supplyNameKey));
  const missing = items.filter((i) => !covered.has(i._id.toString()) && !intentionallyEmpty.has(supplyNameKey(i.name)));
  if (missing.length) log(`AVISO: productos de la carta sin receta en los datos: ${missing.map((i) => i.name).join(", ")}`);
  for (const [product, reason] of Object.entries(WITHOUT_RECIPE)) log(`sin receta a proposito: ${product} (${reason})`);
}

importRecipes()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[import-recipes] error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
