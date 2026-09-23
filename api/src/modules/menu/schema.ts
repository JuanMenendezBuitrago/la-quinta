export const menuTypeDefs = /* GraphQL */ `
  type MenuCategory {
    id: ID!
    name: String!
    order: Int!
    """Por defecto solo los disponibles. Con includeUnavailable: true (requiere personal) trae tambien los ocultos."""
    items(includeUnavailable: Boolean): [MenuItem!]!
  }

  type MenuItem {
    id: ID!
    category: MenuCategory!
    name: String!
    description: String
    priceCents: Int!
    allergens: [String!]!
    available: Boolean!
    imageUrl: String
  }

  input MenuItemInput {
    categoryId: ID!
    name: String!
    description: String
    priceCents: Int!
    allergens: [String!]
    available: Boolean
    imageUrl: String
  }

  extend type Query {
    """Carta completa, agrupada por categoria y en orden de visualizacion."""
    menu: [MenuCategory!]!
  }

  extend type Mutation {
    createMenuCategory(name: String!, order: Int): MenuCategory!
    updateMenuCategory(id: ID!, name: String, order: Int): MenuCategory!
    createMenuItem(input: MenuItemInput!): MenuItem!
    updateMenuItem(id: ID!, input: MenuItemInput!): MenuItem!
    deleteMenuItem(id: ID!): Boolean!
    setMenuItemAvailability(id: ID!, available: Boolean!): MenuItem!
  }
`;
