export const ordersTypeDefs = /* GraphQL */ `
  enum OrderStatus {
    NUEVO
    EN_PREPARACION
    LISTO
    ENTREGADO
    CANCELADO
  }

  type OrderLineOption {
    groupName: String!
    name: String!
    priceDeltaCents: Int!
    """La que lleva el producto por defecto: en la cola solo se destacan las que no lo son."""
    isDefault: Boolean!
  }

  type OrderLine {
    menuItemId: ID!
    name: String!
    """Precio por unidad, con los suplementos de las opciones incluidos."""
    priceCents: Int!
    quantity: Int!
    """Personalizaciones elegidas (p. ej. Leche: Avena), incluidas las de por defecto."""
    options: [OrderLineOption!]!
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

  enum PaymentMethod {
    EFECTIVO
    TARJETA
    """Transferencia o Nequi."""
    TRANSFERENCIA
  }

  type Order {
    id: ID!
    """Codigo corto y unico del pedido (p. ej. P-7K3F9Q)."""
    code: String!
    """Null si lo tomo el personal para alguien sin cuenta (se puede asignar despues)."""
    customer: Customer
    """WEB: lo hizo el cliente; STAFF: lo tomo el personal."""
    source: OrderSource!
    """En mesa (el personal, o el cliente desde el local) o para llevar. Null: pedido web para recoger."""
    serviceType: ServiceType
    table: String
    note: String
    items: [OrderLine!]!
    totalCents: Int!
    pickupSlot: String!
    status: OrderStatus!
    deliveredAt: String
    """Solo pedidos de mesa y barra, que se cobran aparte (antes o despues de entregar)."""
    paidAt: String
    paymentMethod: PaymentMethod
    """De mesa o barra, sin cobrar y no cancelado."""
    awaitingPayment: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  input OrderLineInput {
    menuItemId: ID!
    quantity: Int!
    """Opciones elegidas. En los grupos sin eleccion se aplica la opcion por defecto del producto."""
    optionIds: [ID!]
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
    """Cola del panel de personal: pedidos activos y los de mesa servidos sin cobrar."""
    orderQueue: [Order!]!
    """Pedidos cerrados (entregados y, si son de mesa, cobrados) o cancelados, mas recientes primero."""
    orderHistory(limit: Int): [Order!]!
  }

  extend type Mutation {
    """
    Cliente: para recoger a la hora pickupSlot o, si indica mesa (table), desde el propio local:
    se sirve en esa mesa o en la barra ("Barra"), se prepara ya y se cobra aparte.
    """
    createOrder(items: [OrderLineInput!]!, pickupSlot: String, table: String): Order!
    setOrderStatus(id: ID!, status: OrderStatus!): Order!
    """Personal: cobra un pedido de mesa o barra (antes o despues de entregarlo)."""
    markOrderPaid(id: ID!, method: PaymentMethod!): Order!
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
