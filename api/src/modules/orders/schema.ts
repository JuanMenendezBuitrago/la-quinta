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

  """Por que se rebaja un pedido."""
  enum DiscountReason {
    """Canje de los sellos del cliente: una unidad de un producto del pedido, gratis."""
    CANJE
    INVITACION
    PERSONAL
    """Producto defectuoso o error."""
    ERROR
    HABITUAL
    """Pide una nota que lo explique."""
    OTRO
  }

  """Rebaja sobre el pedido (productos + empaque)."""
  type OrderDiscount {
    """Solo si se pidio en porcentaje."""
    percent: Int
    """Lo que se resta del pedido, en pesos."""
    amountCents: Int!
    reason: DiscountReason!
    """En el canje de sellos, el nombre del producto canjeado."""
    note: String
    """Solo en el canje de sellos: posicion en items del producto canjeado."""
    lineIndex: Int
    """Quien lo aplico (en una cuenta compartida, la persona elegida)."""
    staffName: String
  }

  """Descuento en porcentaje (1-100) o en pesos (uno de los dos). Barra, hasta el 20 % del pedido.
  Con el motivo CANJE, ni porcentaje ni pesos: sale gratis una unidad de la linea lineIndex (o de la
  mas barata), el pedido debe tener cliente con la recompensa disponible y se le restan los sellos."""
  input OrderDiscountInput {
    percent: Int
    amountCents: Int
    reason: DiscountReason!
    """Obligatoria con el motivo OTRO."""
    note: String
    """Solo con CANJE: posicion en items del producto que se canjea."""
    lineIndex: Int
  }

  """Un cambio de estado del pedido."""
  type OrderStatusChange {
    status: OrderStatus!
    at: String!
    """Quien lo hizo; null en el NUEVO de un pedido web (lo crea el cliente) y en los reconstruidos."""
    staffName: String
    staffAvatar: String
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
    """Lo que se cobra: productos + empaque - descuento."""
    totalCents: Int!
    discount: OrderDiscount
    """Recargo por empaque de este pedido (el vigente al crearlo; 0 en mesa o barra)."""
    packagingCents: Int!
    """Va empaquetado: para llevar, recogida web, o mesa/barra marcado "para llevar"."""
    takeaway: Boolean!
    pickupSlot: String!
    status: OrderStatus!
    """Todos los cambios de estado en orden. Los pedidos anteriores solo tienen creacion, entrega y cancelacion."""
    statusHistory: [OrderStatusChange!]!
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
    """Mesa o barra, pero se lo llevan (empaquetado): lleva el recargo por empaque y descuenta
    vasos, tapas... como un pedido para llevar. Con serviceType LLEVAR no hace falta."""
    takeaway: Boolean
    """Guardar y pagar: ya se entrego y se cobra en el acto con este metodo. El pedido nace
    entregado y cobrado (cerrado), sin pasar por la cola."""
    paymentMethod: PaymentMethod
    """Descuento con su motivo (ver OrderDiscountInput)."""
    discount: OrderDiscountInput
  }

  extend type Query {
    """Historial de pedidos del cliente autenticado."""
    myOrders: [Order!]!
    """Cola del panel de personal: pedidos activos y los de mesa servidos sin cobrar."""
    orderQueue: [Order!]!
    """
    Pedidos cerrados (entregados y, si son de mesa, cobrados) o cancelados, mas recientes primero.
    Filtros opcionales: cerrados entre from y to (instantes ISO), alguien del personal que lo tomo
    o le cambio el estado, y cliente.
    """
    orderHistory(limit: Int, from: String, to: String, staffId: ID, customerId: ID): [Order!]!
    """Personal: ids de los productos mas pedidos (por unidades) en los ultimos 30 dias, de mas a menos.
    Para los atajos de "tomar pedido"; puede incluir productos ya borrados o no disponibles."""
    topMenuItems(limit: Int): [ID!]!
  }

  extend type Mutation {
    """
    Cliente: para recoger a la hora pickupSlot o, si indica mesa (table), desde el propio local:
    se sirve en esa mesa o en la barra ("Barra"), se prepara ya y se cobra aparte.
    """
    createOrder(items: [OrderLineInput!]!, pickupSlot: String, table: String): Order!
    """paymentMethod: solo al pasar a ENTREGADO un pedido que no es de mesa (se cobra al entregarlo):
    queda cobrado con ese metodo, para el cierre de caja."""
    setOrderStatus(id: ID!, status: OrderStatus!, paymentMethod: PaymentMethod): Order!
    """Personal: cobra un pedido de mesa o barra (antes o despues de entregarlo)."""
    markOrderPaid(id: ID!, method: PaymentMethod!): Order!
    """Personal: pedido tomado en el local (mesero o barra). La recogida es ahora."""
    createStaffOrder(input: StaffOrderInput!): Order!
    """Personal: pone, cambia o quita (discount null) el descuento de un pedido aun sin cobrar."""
    setOrderDiscount(id: ID!, discount: OrderDiscountInput): Order!
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
