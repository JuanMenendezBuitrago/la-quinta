export const inventoryTypeDefs = /* GraphQL */ `
  """Unidad base del insumo: gramos, mililitros o unidades (vasos, tapas...)."""
  enum SupplyUnit {
    g
    ml
    ud
  }

  enum StockReason {
    compra
    consumo
    merma
    conteo
    ajuste
  }

  """Materia prima o insumo del almacen."""
  type Supply {
    id: ID!
    name: String!
    unit: SupplyUnit!
    category: String!
    minStock: Float!
    """Stock teorico: entradas menos consumos, corregido con cada conteo."""
    stock: Float!
    """Stock igual o por debajo del minimo."""
    low: Boolean!
    active: Boolean!
  }

  type StockMovement {
    id: ID!
    delta: Float!
    reason: StockReason!
    """Consumo: codigo del pedido entregado."""
    orderCode: String
    """Quien lo registro (vacio en el consumo automatico)."""
    staffName: String
    note: String
    countedQty: Float
    createdAt: String!
  }

  type RecipeLine {
    supply: Supply!
    qty: Float!
    onlyTakeaway: Boolean!
  }

  type Recipe {
    menuItemId: ID!
    lines: [RecipeLine!]!
  }

  type SupplyAlert {
    supplyId: ID!
    name: String!
    stock: Float!
    minStock: Float!
    unit: SupplyUnit!
  }

  input SupplyInput {
    name: String!
    unit: SupplyUnit!
    category: String
    minStock: Float!
  }

  input StockCountInput {
    supplyId: ID!
    countedQty: Float!
  }

  input RecipeLineInput {
    supplyId: ID!
    qty: Float!
    onlyTakeaway: Boolean!
  }

  extend type Query {
    """Barra y Gestion. Los inactivos solo si se piden."""
    supplies(includeInactive: Boolean): [Supply!]!
    """Historial de un insumo, del mas reciente al mas antiguo."""
    supplyMovements(supplyId: ID!, limit: Int, offset: Int): [StockMovement!]!
    """Gestion: recetas de todos los productos que tienen una."""
    recipes: [Recipe!]!
  }

  extend type Mutation {
    """Gestion. initialStock crea un conteo inicial."""
    createSupply(input: SupplyInput!, initialStock: Float): Supply!
    updateSupply(id: ID!, input: SupplyInput!): Supply!
    setSupplyActive(id: ID!, active: Boolean!): Supply!
    """Solo si no tiene movimientos ni esta en ninguna receta (para errores al crearlo)."""
    deleteSupply(id: ID!): Boolean!
    """Gestion: correccion manual del saldo, con motivo."""
    adjustStock(supplyId: ID!, delta: Float!, note: String!): Supply!
    """Gestion: lines vacio borra la receta."""
    setRecipe(menuItemId: ID!, lines: [RecipeLineInput!]!): Recipe

    """Barra y Gestion: entrada de mercancia."""
    recordStockEntry(supplyId: ID!, qty: Float!, note: String): Supply!
    """Barra y Gestion: producto tirado, roto, caducado..."""
    recordWaste(supplyId: ID!, qty: Float!, note: String!): Supply!
    """Barra y Gestion: conteo fisico de uno o varios insumos."""
    recordStockCount(counts: [StockCountInput!]!, note: String): [Supply!]!
  }

  extend type Subscription {
    """Personal: un insumo acaba de bajar a su minimo."""
    inventoryAlerts: SupplyAlert!
  }
`;
