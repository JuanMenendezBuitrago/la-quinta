export const competitorsTypeDefs = /* GraphQL */ `
  """Fuente del menu de una cafeteria: un enlace o un archivo subido (PDF o foto)."""
  type CompetitorSource {
    id: ID!
    """url | file"""
    kind: String!
    url: String
    fileName: String
    mimeType: String
  }

  """Producto de la carta de una cafeteria, con su equivalente en la nuestra (si lo hay)."""
  type CompetitorItem {
    id: ID!
    name: String!
    size: String
    category: String
    priceCents: Int!
    menuItemId: ID
    menuItemName: String
    """Gestion confirmo el emparejamiento (o lo eligio a mano)."""
    matchConfirmed: Boolean!
    """Añadido a mano: no se toca al volver a leer el menu."""
    manual: Boolean!
    """Precio de la lectura anterior, si cambio."""
    previousPriceCents: Int
    priceChangedAt: String
  }

  type Competitor {
    id: ID!
    name: String!
    neighborhood: String
    notes: String
    sources: [CompetitorSource!]!
    items: [CompetitorItem!]!
    """idle | reading | error"""
    readStatus: String!
    lastReadAt: String
    lastReadError: String
    lastReadNote: String
    lastReadByName: String
  }

  """Precio de un producto equivalente en una cafeteria."""
  type PriceComparisonEntry {
    competitorId: ID!
    competitorName: String!
    itemName: String!
    size: String
    priceCents: Int!
    confirmed: Boolean!
  }

  """Un producto nuestro frente a sus equivalentes en la competencia."""
  type PriceComparisonRow {
    menuItemId: ID!
    menuItemName: String!
    categoryName: String
    ourPriceCents: Int!
    entries: [PriceComparisonEntry!]!
    minCents: Int!
    avgCents: Int!
    maxCents: Int!
    """Diferencia de nuestro precio con la media, en % (positivo: somos mas caros)."""
    diffPct: Float!
  }

  input CompetitorItemInput {
    name: String!
    size: String
    priceCents: Int!
    menuItemId: ID
  }

  extend type Query {
    """Gestion: cafeterias de la competencia."""
    competitors: [Competitor!]!
    """Gestion: si esta configurada la lectura de menus con Claude."""
    competitorAiEnabled: Boolean!
    """Gestion: nuestros productos con equivalentes en la competencia. Sin includeUnconfirmed, solo
    los emparejamientos confirmados."""
    priceComparison(includeUnconfirmed: Boolean): [PriceComparisonRow!]!
  }

  extend type Mutation {
    createCompetitor(name: String!, neighborhood: String, notes: String): Competitor!
    updateCompetitor(id: ID!, name: String, neighborhood: String, notes: String): Competitor!
    """Borra la cafeteria, sus productos y sus archivos subidos."""
    deleteCompetitor(id: ID!): Boolean!
    """Añade un enlace a su menu (pagina web, PDF o imagen). Los archivos se suben por
    POST /uploads/competitor-menu?competitorId=<id>."""
    addCompetitorUrl(id: ID!, url: String!): Competitor!
    removeCompetitorSource(id: ID!, sourceId: ID!): Competitor!
    """Empieza a leer el menu con Claude (tarda de unos segundos a un par de minutos): devuelve la
    cafeteria con readStatus "reading"; cuando acaba pasa a "idle" (o "error", con lastReadError)."""
    readCompetitorMenu(id: ID!): Competitor!
    """Cambia un producto. menuItemId null: sin equivalente. Cambiar el emparejamiento lo confirma."""
    updateCompetitorItem(id: ID!, itemId: ID!, input: CompetitorItemInput!, matchConfirmed: Boolean): Competitor!
    addCompetitorItem(id: ID!, input: CompetitorItemInput!): Competitor!
    deleteCompetitorItem(id: ID!, itemId: ID!): Competitor!
    """Da por buenos todos los emparejamientos propuestos de una cafeteria."""
    confirmCompetitorMatches(id: ID!): Competitor!
  }
`;
