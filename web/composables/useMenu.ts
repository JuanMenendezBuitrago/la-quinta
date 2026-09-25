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
