export const ordersTypeDefs = /* GraphQL */ `
  enum OrderStatus {
    NUEVO
    EN_PREPARACION
    LISTO
    ENTREGADO
    CANCELADO
  }

  type OrderLine {
    menuItemId: ID!
    name: String!
    priceCents: Int!
    quantity: Int!
    """Imagen actual del producto (puede ser null si nunca tuvo o si el producto se borro)."""
    imageUrl: String
  }

  type Order {
    id: ID!
    """Codigo corto y unico del pedido (p. ej. P-7K3F9Q)."""
    code: String!
    customer: Customer!
    items: [OrderLine!]!
    totalCents: Int!
    pickupSlot: String!
    status: OrderStatus!
    createdAt: String!
    updatedAt: String!
  }

  input OrderLineInput {
    menuItemId: ID!
    quantity: Int!
  }

  extend type Query {
    """Historial de pedidos del cliente autenticado."""
    myOrders: [Order!]!
    """Cola de pedidos activos, para el panel de personal."""
    orderQueue: [Order!]!
    """Pedidos entregados o cancelados, mas recientes primero. Para el panel de personal."""
    orderHistory(limit: Int): [Order!]!
  }

  extend type Mutation {
    createOrder(items: [OrderLineInput!]!, pickupSlot: String!): Order!
    setOrderStatus(id: ID!, status: OrderStatus!): Order!
  }

  extend type Subscription {
    """Personal: se dispara con cualquier alta o cambio de estado en la cola."""
    orderQueueUpdated: Order!
    """Cliente: se dispara cuando cambia el estado de uno de sus pedidos."""
    orderStatusChanged: Order!
  }
`;
