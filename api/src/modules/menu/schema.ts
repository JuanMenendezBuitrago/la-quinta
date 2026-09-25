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
    """Personalizaciones que admite (p. ej. tipo de leche), en orden de visualizacion."""
    modifiers: [MenuItemModifier!]!
  }

  type ModifierOption {
    id: ID!
    name: String!
    """Suplemento sobre el precio del producto (0 = sin recargo)."""
    priceDeltaCents: Int!
    available: Boolean!
  }

  """Personalizacion reutilizable entre productos, p. ej. "Leche": entera, deslactosada, avena."""
  type ModifierGroup {
    id: ID!
    name: String!
    """Minimo y maximo de opciones a elegir: "Leche" es 1 y 1 (una y solo una)."""
    minSelect: Int!
    maxSelect: Int!
    """Por defecto solo las disponibles. Con includeUnavailable: true (requiere personal) trae tambien las agotadas."""
    options(includeUnavailable: Boolean): [ModifierOption!]!
  }

  type MenuItemModifier {
    group: ModifierGroup!
    """Opcion que lleva el producto si no se pide otra (la de su receta)."""
    defaultOptionId: ID
  }

  input MenuItemModifierInput {
    groupId: ID!
    defaultOptionId: ID
  }

  input ModifierOptionInput {
    """Id de una opcion existente para conservarla (los pedidos y productos la referencian); vacio = nueva."""
    id: ID
    name: String!
    priceDeltaCents: Int!
    available: Boolean
  }

  input ModifierGroupInput {
    name: String!
    minSelect: Int!
    maxSelect: Int!
    options: [ModifierOptionInput!]!
  }

  input MenuItemInput {
    categoryId: ID!
    name: String!
    description: String
    priceCents: Int!
    allergens: [String!]
    available: Boolean
    imageUrl: String
    """Si se omite, el producto conserva las personalizaciones que tenia."""
    modifiers: [MenuItemModifierInput!]
  }

  extend type Query {
    """Carta completa, agrupada por categoria y en orden de visualizacion."""
    menu: [MenuCategory!]!
    """Personalizaciones disponibles para asignar a productos (panel de gestion)."""
    modifierGroups: [ModifierGroup!]!
  }

  extend type Mutation {
    createMenuCategory(name: String!, order: Int): MenuCategory!
    updateMenuCategory(id: ID!, name: String, order: Int): MenuCategory!
    createMenuItem(input: MenuItemInput!): MenuItem!
    updateMenuItem(id: ID!, input: MenuItemInput!): MenuItem!
    deleteMenuItem(id: ID!): Boolean!
    setMenuItemAvailability(id: ID!, available: Boolean!): MenuItem!
    createModifierGroup(input: ModifierGroupInput!): ModifierGroup!
    """Reemplaza nombre, limites y opciones. Las opciones que no vienen se eliminan."""
    updateModifierGroup(id: ID!, input: ModifierGroupInput!): ModifierGroup!
    """Elimina el grupo y lo quita de los productos que lo usaban."""
    deleteModifierGroup(id: ID!): Boolean!
  }
`;
