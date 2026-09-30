import { gql } from "graphql-tag";
import type { CartLineOption } from "./useCart";

// Compartida por la carta publica y "Tomar pedido" del panel de personal: los dos muestran
// exactamente los mismos productos (lo oculto o agotado lo esta en ambos sitios).
export const MENU_QUERY = gql`
  query Menu {
    menu {
      id
      name
      items {
        id
        name
        description
        priceCents
        allergens
        imageUrl
        coffee {
          id
          name
          description
          origin
          variety
          process {
            name
          }
          altitudeMasl
          roastLevel
          tastingNotes
        }
        modifiers {
          defaultOptionId
          group {
            id
            name
            minSelect
            maxSelect
            options {
              id
              name
              priceDeltaCents
            }
          }
        }
      }
    }
  }
`;

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

/** Personalizacion de un producto (p. ej. Leche), con la opcion que lleva si no se pide otra. */
export interface MenuItemModifier {
  defaultOptionId: string | null;
  group: { id: string; name: string; minSelect: number; maxSelect: number; options: ModifierOption[] };
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  allergens: string[];
  imageUrl: string | null;
  modifiers: MenuItemModifier[];
  /** Ficha del cafe si el producto es una bolsa de cafe en grano. */
  coffee: CoffeeDetails | null;
}

export interface CoffeeDetails {
  id: string;
  name: string;
  description: string | null;
  origin: string | null;
  variety: string | null;
  process: { name: string } | null;
  altitudeMasl: number | null;
  roastLevel: string | null;
  tastingNotes: string[];
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

/** Opcion de un grupo como la guarda el carrito (isDefault: la que lleva el producto sin pedirla). */
export function cartOption(m: MenuItemModifier, optionId: string): CartLineOption | null {
  const o = m.group.options.find((x) => x.id === optionId);
  return o
    ? { id: o.id, groupId: m.group.id, name: o.name, priceDeltaCents: o.priceDeltaCents, isDefault: o.id === m.defaultOptionId }
    : null;
}

/**
 * El producto tal como viene: sus opciones por defecto. Si alguna esta agotada (la carta solo
 * trae las disponibles), ese grupo queda sin elegir y el carrito o el ticket piden escoger otra.
 */
export function defaultCartOptions(item: { modifiers?: MenuItemModifier[] }): CartLineOption[] {
  return (item.modifiers ?? []).flatMap((m) => {
    const option = m.defaultOptionId ? cartOption(m, m.defaultOptionId) : null;
    return option ? [option] : [];
  });
}

/** Grupos obligatorios sin opcion elegida en esas opciones. */
export function missingModifiers(modifiers: MenuItemModifier[] | undefined, options: CartLineOption[]) {
  return (modifiers ?? []).filter((m) => m.group.minSelect >= 1 && !options.some((o) => o.groupId === m.group.id));
}

/** Nivel de tueste del cafe en grano, para mostrarlo. */
export const ROAST_LABELS: Record<string, string> = { CLARO: "Claro", MEDIO: "Medio", OSCURO: "Oscuro" };

/** Tamano de un cafe en grano dentro de su entrada de la carta. */
export interface MenuSize {
  menuItemId: string;
  name: string; // "Cafe Huila 250 g": lo que se pide y sale en el carrito
  label: string; // "250 g"
  priceCents: number;
}

/** Producto de la carta tal como se muestra: con varios tamanos (sizes), es un cafe en grano. */
export type MenuEntry = MenuItem & { sizes?: MenuSize[] };

function formatCop(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

/**
 * Productos de una categoria para la carta publica: los tamanos de un mismo cafe en grano
 * ("Cafe Huila 250 g", "Cafe Huila 500 g") se juntan en una entrada ("Cafe Huila", desde el
 * precio menor) cuya descripcion lista las presentaciones. Con un solo tamano a la venta, el
 * producto sale tal cual.
 */
export function menuEntries(items: MenuItem[]): MenuEntry[] {
  const byCoffee = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (item.coffee) byCoffee.set(item.coffee.id, [...(byCoffee.get(item.coffee.id) ?? []), item]);
  }
  const entries: MenuEntry[] = [];
  const done = new Set<string>();
  for (const item of items) {
    const group = item.coffee ? byCoffee.get(item.coffee.id)! : [item];
    if (group.length === 1) {
      entries.push(item);
      continue;
    }
    const coffee = item.coffee!;
    if (done.has(coffee.id)) continue;
    done.add(coffee.id);
    // Los productos se llaman "Cafe <nombre> <tamano>" (api/src/modules/coffee/sync.ts).
    const prefix = `Café ${coffee.name} `;
    const sizes = group
      .map((i) => ({
        menuItemId: i.id,
        name: i.name,
        label: i.name.startsWith(prefix) ? i.name.slice(prefix.length) : i.name,
        priceCents: i.priceCents,
      }))
      .sort((a, b) => a.priceCents - b.priceCents);
    const presentations = `Presentaciones: ${sizes.map((s) => `${s.label} (${formatCop(s.priceCents)})`).join(", ")}.`;
    entries.push({
      ...item,
      id: `coffee:${coffee.id}`,
      name: `Café ${coffee.name}`,
      priceCents: sizes[0].priceCents,
      description: coffee.description ? `${presentations} ${coffee.description}` : presentations,
      imageUrl: group.find((i) => i.imageUrl)?.imageUrl ?? null,
      modifiers: [],
      sizes,
    });
  }
  return entries;
}
