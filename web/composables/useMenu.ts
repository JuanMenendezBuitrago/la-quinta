import { gql } from "graphql-tag";

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
      }
    }
  }
`;

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  allergens: string[];
  imageUrl: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}
