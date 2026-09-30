import { Types } from "mongoose";
import { MenuCategory, MenuItem } from "../menu/model";
import { Recipe, Supply, supplyNameKey } from "../inventory/model";
import { Coffee, CoffeeDoc, CoffeePresentationDoc, ROAST_LEVELS, RoastLevel } from "./model";

/** Categoria de la carta donde salen las bolsas. Se crea al dar de alta el primer cafe. */
export const COFFEE_CATEGORY = "Café en grano";
const MAX_GRAMS = 5000; // 5 kg: por encima, seguro que es un error de tecleo
const MAX_PRICE_CENTS = 10_000_000;

export interface CoffeeInput {
  name: string;
  origin?: string | null;
  variety?: string | null;
  processId?: string | null;
  altitudeMasl?: number | null;
  roastLevel?: RoastLevel | null;
  tastingNotes?: string[] | null;
  description?: string | null;
  imageUrl?: string | null;
  available?: boolean | null;
  presentations: { grams: number; priceCents: number; available?: boolean | null }[];
}

export function productName(coffeeName: string, grams: number) {
  return `Café ${coffeeName} ${grams} g`;
}

export function bagSupplyName(coffeeName: string, grams: number) {
  return `Café ${coffeeName} · bolsa ${grams} g`;
}

function optionalText(value: string | null | undefined, max: number, label: string) {
  const text = value?.trim().replace(/\s+/g, " ") || undefined;
  if (text && text.length > max) throw new Error(`${label} no puede pasar de ${max} caracteres`);
  return text;
}

/** Valida y normaliza lo que llega del panel. */
export function cleanCoffeeInput(input: CoffeeInput) {
  const name = optionalText(input.name, 40, "El nombre");
  if (!name) throw new Error("Indica el nombre del cafe");
  if (input.altitudeMasl != null && (!Number.isInteger(input.altitudeMasl) || input.altitudeMasl < 0 || input.altitudeMasl > 5000)) {
    throw new Error("La altitud no es valida");
  }
  if (input.roastLevel && !ROAST_LEVELS.includes(input.roastLevel)) throw new Error("Nivel de tueste no valido");
  if (input.processId && !Types.ObjectId.isValid(input.processId)) throw new Error("Proceso no encontrado");

  const tastingNotes = (input.tastingNotes ?? []).map((n) => n.trim()).filter(Boolean);
  if (tastingNotes.length > 8 || tastingNotes.some((n) => n.length > 40)) throw new Error("Demasiadas notas de cata o demasiado largas");

  if (!input.presentations.length) throw new Error("Indica al menos un tamaño de bolsa");
  const seen = new Set<number>();
  const presentations = input.presentations.map((p) => {
    if (!Number.isInteger(p.grams) || p.grams < 1 || p.grams > MAX_GRAMS) throw new Error("El tamaño de la bolsa no es valido");
    if (seen.has(p.grams)) throw new Error(`El tamaño de ${p.grams} g esta repetido`);
    seen.add(p.grams);
    if (!Number.isInteger(p.priceCents) || p.priceCents < 0 || p.priceCents > MAX_PRICE_CENTS) {
      throw new Error(`El precio de la bolsa de ${p.grams} g no es valido`);
    }
    return { grams: p.grams, priceCents: p.priceCents, available: p.available ?? true };
  });

  return {
    name,
    origin: optionalText(input.origin, 80, "El origen"),
    variety: optionalText(input.variety, 60, "La variedad"),
    processId: input.processId ? new Types.ObjectId(input.processId) : null,
    altitudeMasl: input.altitudeMasl ?? undefined,
    roastLevel: input.roastLevel ?? undefined,
    tastingNotes,
    description: optionalText(input.description, 400, "La descripcion"),
    imageUrl: input.imageUrl?.trim() || undefined,
    available: input.available ?? true,
    presentations: presentations.sort((a, b) => a.grams - b.grams),
  };
}

type CleanCoffee = ReturnType<typeof cleanCoffeeInput>;

async function ensureCategory() {
  const existing = await MenuCategory.findOne({ name: COFFEE_CATEGORY });
  if (existing) return existing;
  const last = await MenuCategory.findOne().sort({ order: -1 }).lean();
  return MenuCategory.create({ name: COFFEE_CATEGORY, order: (last?.order ?? -1) + 1 });
}

/**
 * Insumo de bolsas de un tamano (en unidades). Si ya existe uno con ese nombre y no es de otro
 * cafe (p. ej. se dio de alta a mano en Inventario), se reutiliza.
 */
async function ensureBagSupply(coffeeName: string, grams: number, current?: Types.ObjectId) {
  const name = bagSupplyName(coffeeName, grams);
  const nameKey = supplyNameKey(name);
  const sameName = await Supply.findOne({ nameKey });
  if (current) {
    if (sameName && !sameName._id.equals(current)) throw new Error(`Ya existe un insumo llamado «${name}»`);
    await Supply.updateOne({ _id: current }, { $set: { name, nameKey } }); // al renombrar el cafe
    return current;
  }
  if (sameName) {
    if (sameName.unit !== "ud") throw new Error(`Ya existe el insumo «${name}», pero no se cuenta en unidades`);
    if (await Coffee.exists({ "presentations.supplyId": sameName._id })) throw new Error(`«${name}» ya es de otro cafe`);
    return sameName._id;
  }
  const supply = await Supply.create({ name, nameKey, unit: "ud", category: COFFEE_CATEGORY, minStock: 0, stock: 0, active: true });
  return supply._id;
}

/** La receta del producto lleva una bolsa; si alguien le anadio algo mas a mano, se respeta. */
async function ensureBagRecipe(menuItemId: Types.ObjectId, supplyId: Types.ObjectId) {
  const recipe = await Recipe.findOne({ menuItemId });
  if (!recipe) {
    await Recipe.create({ menuItemId, lines: [{ supplyId, qty: 1, onlyTakeaway: false }] });
    return;
  }
  if (recipe.lines.some((l) => l.supplyId.equals(supplyId))) return;
  recipe.lines.push({ supplyId, qty: 1, onlyTakeaway: false });
  recipe.updatedAt = new Date();
  await recipe.save();
}

/**
 * Crea o actualiza los productos de la carta, los insumos y las recetas de cada tamano, y devuelve
 * las presentaciones para guardar en el cafe. Los tamanos que ya no vienen se ocultan de la carta
 * (no se borran: los pedidos antiguos los referencian) y se conservan, por si vuelven.
 *
 * Todo es idempotente: si algo falla a medias, volver a guardar el cafe lo completa.
 */
export async function syncPresentations(coffee: CleanCoffee, existing: CoffeePresentationDoc[] = []) {
  const category = await ensureCategory();
  // Solo la descripcion escrita: origen, proceso y notas ya salen en la ficha (MenuItem.coffee).
  const description = coffee.description;
  const result: CoffeePresentationDoc[] = [];

  for (const p of coffee.presentations) {
    const current = existing.find((e) => e.grams === p.grams);
    const supplyId = await ensureBagSupply(coffee.name, p.grams, current?.supplyId);
    const fields = {
      categoryId: category._id,
      name: productName(coffee.name, p.grams),
      description: description ?? null,
      priceCents: p.priceCents,
      imageUrl: coffee.imageUrl ?? null,
      available: coffee.available && p.available,
    };
    let menuItemId = current?.menuItemId;
    if (menuItemId && (await MenuItem.exists({ _id: menuItemId }))) {
      await MenuItem.updateOne({ _id: menuItemId }, { $set: fields });
    } else {
      // Nuevo, o su producto se borro desde la carta: se vuelve a crear.
      menuItemId = (await MenuItem.create({ ...fields, allergens: [], modifiers: [] }))._id;
    }
    await ensureBagRecipe(menuItemId, supplyId);
    result.push({ grams: p.grams, available: p.available, menuItemId, supplyId });
  }

  for (const old of existing) {
    if (result.some((r) => r.grams === old.grams)) continue;
    // Oculto, pero con el nombre al dia: si el cafe se renombra, que no se quede con el antiguo
    // (otro cafe podria llamarse asi despues y chocarian los nombres).
    await ensureBagSupply(coffee.name, old.grams, old.supplyId);
    await MenuItem.updateOne(
      { _id: old.menuItemId },
      { $set: { name: productName(coffee.name, old.grams), available: false } }
    );
    result.push({ ...old, available: false });
  }
  return result.sort((a, b) => a.grams - b.grams);
}

/** Documento a guardar: la ficha y las presentaciones sincronizadas. */
export function coffeeFields(coffee: CleanCoffee, presentations: CoffeePresentationDoc[]): Partial<CoffeeDoc> {
  const { presentations: _input, ...fields } = coffee;
  return { ...fields, presentations };
}
