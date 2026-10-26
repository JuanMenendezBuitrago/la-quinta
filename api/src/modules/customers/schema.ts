export const customersTypeDefs = /* GraphQL */ `
  """Cliente con sus cifras, para el panel del personal."""
  type CustomerSummary {
    id: ID!
    name: String!
    email: String
    phone: String
    customerCode: String!
    avatar: String
    createdAt: String!
    """Pedidos de cualquier estado."""
    ordersCount: Int!
    deliveredCount: Int!
    cancelledCount: Int!
    """Total de los pedidos entregados (pesos)."""
    spentCents: Int!
    lastOrderAt: String
    stampsBalance: Int!
    rewardAvailable: Boolean!
  }

  type CustomerPage {
    total: Int!
    items: [CustomerSummary!]!
  }

  type CustomerStampMovement {
    id: ID!
    stamps: Int!
    """pedido, canje, ajuste o foto (foto de cliente aprobada)."""
    reason: String!
    note: String
    """Codigo del pedido que dio los sellos, si lo hay."""
    orderCode: String
    """Nombre del miembro del personal que hizo el ajuste o el canje, si lo hay."""
    staffName: String
    createdAt: String!
  }

  type CustomerDetail {
    customer: CustomerSummary!
    rewardThreshold: Int!
    """Mas recientes primero."""
    orders: [Order!]!
    """Mas recientes primero."""
    stamps: [CustomerStampMovement!]!
  }

  extend type Query {
    """Personal (barra y gestion): clientes registrados (sin las cuentas eliminadas), mas recientes primero.
    search busca en nombre, email, telefono y codigo de cliente."""
    customers(search: String, limit: Int, offset: Int): CustomerPage!
    """Personal (barra y gestion): ficha completa de un cliente."""
    customerDetail(id: ID!): CustomerDetail!
  }
`;
