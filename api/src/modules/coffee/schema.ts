export const coffeeTypeDefs = /* GraphQL */ `
  enum RoastLevel {
    CLARO
    MEDIO
    OSCURO
  }

  """
  Tamano de bolsa. Se vende como un producto de la carta (menuItem): su precio y disponibilidad
  son los de ese producto, y su stock, el de un insumo contado en bolsas (Inventario).
  """
  type CoffeePresentation {
    grams: Int!
    priceCents: Int!
    """Si este tamano se vende (su producto sale en la carta si ademas el cafe esta disponible)."""
    available: Boolean!
    menuItem: MenuItem!
  }

  """Proceso de beneficio (lavado, honey, natural...), elegido de una tabla."""
  type CoffeeProcess {
    id: ID!
    name: String!
    """Cafes que lo usan (no se puede borrar mientras haya alguno)."""
    coffeeCount: Int!
  }

  """Cafe tostado en grano que se vende en bolsas."""
  type Coffee {
    id: ID!
    name: String!
    origin: String
    variety: String
    process: CoffeeProcess
    altitudeMasl: Int
    roastLevel: RoastLevel
    tastingNotes: [String!]!
    description: String
    imageUrl: String
    available: Boolean!
    """De menor a mayor. Sin includeUnavailable, solo los tamanos a la venta."""
    presentations(includeUnavailable: Boolean): [CoffeePresentation!]!
  }

  input CoffeePresentationInput {
    grams: Int!
    priceCents: Int!
    available: Boolean
  }

  input CoffeeInput {
    """Los productos se llaman "Cafe <name> 250 g"."""
    name: String!
    origin: String
    variety: String
    """Uno de coffeeProcesses."""
    processId: ID
    altitudeMasl: Int
    roastLevel: RoastLevel
    tastingNotes: [String!]
    description: String
    imageUrl: String
    available: Boolean
    """Todos los tamanos: los que ya existian y no vienen se ocultan de la carta."""
    presentations: [CoffeePresentationInput!]!
  }

  extend type MenuItem {
    """Ficha del cafe si el producto es una bolsa de cafe en grano."""
    coffee: Coffee
  }

  extend type Query {
    """Por defecto solo los disponibles. Con includeUnavailable: true (requiere personal) todos."""
    coffees(includeUnavailable: Boolean): [Coffee!]!
    """Procesos para elegir en la ficha del cafe, por nombre."""
    coffeeProcesses: [CoffeeProcess!]!
  }

  extend type Mutation {
    """
    Gestion. Crea sus productos en la categoria "Cafe en grano" de la carta, un insumo de bolsas
    (unidades) por tamano y la receta de cada producto (1 bolsa).
    """
    createCoffee(input: CoffeeInput!): Coffee!
    """Gestion. Actualiza tambien sus productos (nombre, precio, disponibilidad) e insumos."""
    updateCoffee(id: ID!, input: CoffeeInput!): Coffee!
    """Gestion. Procesos de la tabla: el nombre no se puede repetir (sin distinguir tildes ni mayusculas)."""
    createCoffeeProcess(name: String!): CoffeeProcess!
    """Gestion. El cambio se ve en todos los cafes que lo usan."""
    renameCoffeeProcess(id: ID!, name: String!): CoffeeProcess!
    """Gestion. Solo si ningun cafe lo usa."""
    deleteCoffeeProcess(id: ID!): Boolean!
  }
`;
