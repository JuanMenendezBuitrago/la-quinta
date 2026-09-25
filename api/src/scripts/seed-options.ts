/**
 * Personalizaciones de la carta y su efecto en el inventario:
 * - "Leche" (obligatoria): entera, deslactosada, avena, almendra. Se asigna a los productos cuya
 *   receta lleva leche entera o deslactosada, con esa leche como la de por defecto.
 * - "Adición" (opcional) en los tés: leche o bebida de almendra.
 * - "Base" (obligatoria) en los jugos que se hacen en leche (no los citricos): agua (por defecto)
 *   o leche.
 * Sustituyen a los productos sueltos "Adición Leche", "Adición Bebida Almendra" y "Opción Leche
 * 250ml", que se ocultan de la carta (no se borran).
 *
 * - Los grupos se buscan por nombre: si ya existen no se tocan (precios y opciones se ajustan en
 *   el panel, Carta -> Personalizaciones).
 * - Solo se asignan a productos que aun no los tienen, para no pisar lo que se haya cambiado a mano.
 * - Inventario: enlaza cada opcion con su insumo, creando los que no existen con stock 0. Las
 *   opciones que ya tienen insumo no se tocan.
 * - Con --dry-run solo muestra lo que haria, sin escribir nada.
 *
 * Uso: npm run seed-options [-- --dry-run]                              (desarrollo)
 *      docker compose exec api node dist/scripts/seed-options.js [--dry-run]
 */
import mongoose, { Types } from "mongoose";
import { connectMongo } from "../config/db";
import { MenuCategory, MenuItem, ModifierGroup, ModifierGroupDoc } from "../modules/menu/model";
import { OptionSupply, Recipe, Supply, supplyNameKey } from "../modules/inventory/model";

const dryRun = process.argv.includes("--dry-run");
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log("[seed-options]", ...args);

interface OptionSeed {
  name: string;
  priceDeltaCents: number;
  supply?: string;
  // Cantidad por unidad si la opcion se anade (no sustituye a un insumo de la receta).
  qty?: number;
}
interface GroupSeed {
  name: string;
  minSelect: number;
  options: OptionSeed[];
}

// Suplementos iniciales: los precios de los productos sueltos que sustituyen. Se cambian en el panel.
const LECHE: GroupSeed = {
  name: "Leche",
  minSelect: 1,
  options: [
    { name: "Entera", priceDeltaCents: 0, supply: "Leche entera" },
    { name: "Deslactosada", priceDeltaCents: 0, supply: "Leche deslactosada" },
    { name: "Avena", priceDeltaCents: 3000, supply: "Leche de avena" },
    { name: "Almendra", priceDeltaCents: 5000, supply: "Bebida de almendra" },
  ],
};
// Sin cantidad: no se sabe cuanta leche lleva una adicion; se pone en Inventario -> Recetas.
const ADICION: GroupSeed = {
  name: "Adición",
  minSelect: 0,
  options: [
    { name: "Leche", priceDeltaCents: 3000, supply: "Leche entera" },
    { name: "Almendra", priceDeltaCents: 5000, supply: "Bebida de almendra" },
  ],
};
const BASE: GroupSeed = {
  name: "Base",
  minSelect: 1,
  options: [
    { name: "Agua", priceDeltaCents: 0 },
    { name: "Leche", priceDeltaCents: 3000, supply: "Leche entera", qty: 250 },
  ],
};

// Productos sueltos que pasan a ser personalizaciones: se ocultan y no reciben grupos.
const REPLACED_PRODUCTS = ["Adición Leche", "Adición Bebida Almendra", "Opción Leche 250ml"];
// Leches de las recetas: detectan que productos llevan leche y cual es su leche por defecto.
const RECIPE_MILKS: Record<string, string> = { "Leche entera": "Entera", "Leche deslactosada": "Deslactosada" };

async function ensureGroup(seed: GroupSeed) {
  const existing = await ModifierGroup.findOne({ name: seed.name });
  if (existing) {
    log(`el grupo «${seed.name}» ya existe: no se modifican sus opciones`);
    return existing;
  }
  log(`${dryRun ? "se crearia" : "creado"} el grupo «${seed.name}»: ${seed.options.map((o) => o.name).join(", ")}`);
  if (dryRun) return null;
  return ModifierGroup.create({
    name: seed.name,
    minSelect: seed.minSelect,
    maxSelect: 1,
    options: seed.options.map(({ name, priceDeltaCents }) => ({ name, priceDeltaCents, available: true })),
  });
}

/** Asigna el grupo a los productos, con la opcion por defecto que diga `defaultFor` (o ninguna). */
async function assignGroup(
  group: ModifierGroupDoc | null,
  groupName: string,
  items: { _id: Types.ObjectId; name: string }[],
  defaultFor: (item: { _id: Types.ObjectId; name: string }) => string | null
) {
  let assigned = 0;
  let kept = 0;
  for (const { _id, name } of items) {
    const item = await MenuItem.findById(_id);
    if (!item) continue;
    if (group && item.modifiers.some((m) => m.groupId.equals(group._id))) {
      kept++;
      continue;
    }
    const defaultName = defaultFor(item);
    const defaultOption = defaultName ? group?.options.find((o) => o.name === defaultName) : null;
    if (group && defaultName && !defaultOption) {
      log(`AVISO: ${name}: «${groupName}» no tiene la opcion «${defaultName}»; asignalo desde el panel`);
      continue;
    }
    assigned++;
    log(`${dryRun ? "se asignaria" : "asignado"} «${groupName}»: ${name}${defaultName ? ` (por defecto: ${defaultName})` : ""}`);
    if (dryRun || !group) continue;
    item.modifiers.push({ groupId: group._id, defaultOptionId: defaultOption?._id ?? null });
    await item.save();
  }
  log(`«${groupName}»: ${assigned} ${dryRun ? "se asignarian" : "asignados"}, ${kept} ya lo tenian`);
}

async function categoryItems(categoryName: string) {
  const category = await MenuCategory.findOne({ name: categoryName }).lean();
  if (!category) {
    log(`AVISO: no hay categoria «${categoryName}»`);
    return [];
  }
  const items = await MenuItem.find({ categoryId: category._id }).select("name").lean();
  return items.filter((i) => !REPLACED_PRODUCTS.includes(i.name));
}

/** Enlaza cada opcion con su insumo (creandolo si falta), salvo las que ya tienen uno. */
async function linkSupplies(group: ModifierGroupDoc | null, seed: GroupSeed) {
  if (!group) return;
  const linked = new Set(
    (await OptionSupply.find({ optionId: { $in: group.options.map((o) => o._id) } }).lean()).map((o) => o.optionId.toString())
  );
  for (const optionSeed of seed.options) {
    if (!optionSeed.supply) continue;
    const option = group.options.find((o) => o.name === optionSeed.name);
    if (!option || linked.has(option._id.toString())) continue;
    const nameKey = supplyNameKey(optionSeed.supply);
    let supply = await Supply.findOne({ nameKey }).lean();
    if (!supply) {
      log(`${dryRun ? "se crearia" : "creado"} el insumo «${optionSeed.supply}» (ml, stock 0: anota su stock con un conteo)`);
      if (dryRun) continue;
      supply = (
        await Supply.create({ name: optionSeed.supply, nameKey, unit: "ml", category: "Lácteos", minStock: 0, stock: 0, active: true })
      ).toObject();
    }
    if (supply.unit !== "ml") {
      log(`AVISO: «${supply.name}» no esta en ml: enlaza «${seed.name}: ${optionSeed.name}» desde el panel`);
      continue;
    }
    const qty = optionSeed.qty ? ` (${optionSeed.qty} ml si se anade)` : "";
    log(`${dryRun ? "se enlazaria" : "enlazada"}: «${seed.name}: ${optionSeed.name}» = insumo «${supply.name}»${qty}`);
    if (!dryRun) await OptionSupply.create({ optionId: option._id, supplyId: supply._id, qty: optionSeed.qty ?? null });
  }
}

async function seedOptions() {
  await connectMongo();
  if (dryRun) log("modo prueba (--dry-run): no se escribe nada");

  // --- Leche: productos cuya receta lleva leche, con la suya por defecto (la de mas cantidad) ---
  const leche = await ensureGroup(LECHE);
  const milkSupplies = await Supply.find({ nameKey: { $in: Object.keys(RECIPE_MILKS).map(supplyNameKey) } }).lean();
  const optionBySupply = new Map(
    milkSupplies.map((s) => [s._id.toString(), RECIPE_MILKS[Object.keys(RECIPE_MILKS).find((k) => supplyNameKey(k) === s.nameKey)!]])
  );
  const recipes = await Recipe.find({ "lines.supplyId": { $in: milkSupplies.map((s) => s._id) } }).lean();
  const recipeItems = await MenuItem.find({ _id: { $in: recipes.map((r) => r.menuItemId) } }).select("name").lean();
  const milkOf = (itemId: Types.ObjectId) => {
    const recipe = recipes.find((r) => r.menuItemId.equals(itemId))!;
    const milk = recipe.lines.filter((l) => optionBySupply.has(l.supplyId.toString())).sort((a, b) => b.qty - a.qty)[0];
    return optionBySupply.get(milk.supplyId.toString())!;
  };
  await assignGroup(
    leche,
    LECHE.name,
    recipeItems.filter((i) => !REPLACED_PRODUCTS.includes(i.name)),
    (item) => milkOf(item._id)
  );
  await linkSupplies(leche, LECHE);

  // --- Adición en los tés y Base en los jugos ---
  const adicion = await ensureGroup(ADICION);
  await assignGroup(adicion, ADICION.name, await categoryItems("Té / Infusiones"), () => null);
  await linkSupplies(adicion, ADICION);

  const base = await ensureGroup(BASE);
  // Los citricos cortan la leche: naranja, mandarina y limonadas se quedan sin "en leche".
  const juices = (await categoryItems("Jugos Naturales")).filter((i) => !/naranja|mandarina|limonada/i.test(i.name));
  await assignGroup(base, BASE.name, juices, () => "Agua");
  await linkSupplies(base, BASE);

  // --- Productos sueltos sustituidos: se ocultan (siguen en los pedidos antiguos) y sin grupos ---
  const replaced = await MenuItem.find({ name: { $in: REPLACED_PRODUCTS } });
  for (const item of replaced) {
    if (!item.available && !item.modifiers.length) continue;
    log(`${dryRun ? "se ocultaria" : "oculto"}: ${item.name}`);
    if (dryRun) continue;
    item.available = false;
    item.modifiers = [];
    await item.save();
  }
}

seedOptions()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed-options] error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
