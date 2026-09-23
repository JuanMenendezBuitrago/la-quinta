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

  enum OrderSource {
    WEB
    STAFF
  }

  enum ServiceType {
    MESA
    LLEVAR
  }

  type Order {
    id: ID!
    """Codigo corto y unico del pedido (p. ej. P-7K3F9Q)."""
    code: String!
    """Null si lo tomo el personal para alguien sin cuenta (se puede asignar despues)."""
    customer: Customer
    """WEB: lo hizo el cliente; STAFF: lo tomo el personal."""
    source: OrderSource!
    """Solo pedidos del personal: en mesa o para llevar."""
    serviceType: ServiceType
    table: String
    note: String
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

  input StaffOrderInput {
    items: [OrderLineInput!]!
    serviceType: ServiceType!
    """Obligatoria si serviceType es MESA."""
    table: String
    """Cliente registrado, si da su codigo o telefono (ver lookupCustomer)."""
    customerId: ID
    note: String
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
    """Personal: pedido tomado en el local (mesero o barra). La recogida es ahora."""
    createStaffOrder(input: StaffOrderInput!): Order!
    """Personal: asocia un cliente a un pedido activo que no tenia."""
    assignOrderCustomer(orderId: ID!, customerId: ID!): Order!
  }

  extend type Subscription {
    """Personal: se dispara con cualquier alta o cambio de estado en la cola."""
    orderQueueUpdated: Order!
    """Cliente: se dispara cuando cambia el estado de uno de sus pedidos."""
    orderStatusChanged: Order!
  }
`;
