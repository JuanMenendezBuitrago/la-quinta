export const ordersTypeDefs = /* GraphQL */ `
  enum OrderStatus {
    NUEVO
    EN_PREPARACION
    LISTO
    ENTREGADO
    CANCELADO
  }

  type OrderLineOption {
    groupId: ID!
    optionId: ID!
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
    """Canje de sellos: no se elige como motivo (va en Order.redemption); sale asi en el cierre de caja."""
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
    note: String
    """Quien lo aplico (en una cuenta compartida, la persona elegida)."""
    staffName: String
  }

  """Canje de sellos: una unidad de un producto del pedido, gratis."""
  type OrderRedemption {
    """Posicion en items del producto canjeado."""
    lineIndex: Int!
    name: String!
    """Lo que se resta del pedido: el precio de esa unidad, con sus suplementos."""
    amountCents: Int!
    staffName: String
  }

  """Descuento en porcentaje (1-100) o en pesos (uno de los dos), sobre lo que queda tras el canje
  de sellos. Barra, hasta el 20 %. El motivo no puede ser CANJE (el canje va en OrderRedemptionInput)."""
  input OrderDiscountInput {
    percent: Int
    amountCents: Int
    reason: DiscountReason!
    """Obligatoria con el motivo OTRO."""
    note: String
  }

  """Canje de sellos: el pedido debe tener cliente con la recompensa disponible, y se le restan los sellos."""
  input OrderRedemptionInput {
    """Posicion en items del producto gratis; sin ella, el mas barato."""
    lineIndex: Int
  }

  """Unidades de una linea del pedido (posicion en items) que paga una persona."""
  type OrderPaymentUnits {
    lineIndex: Int!
    quantity: Int!
  }

  input OrderPaymentUnitsInput {
    lineIndex: Int!
    quantity: Int!
  }

  enum SplitMode {
    """Cada persona paga lo que tomo."""
    PRODUCTOS
    """El total entre N personas."""
    IGUALES
    """Cada persona paga la cantidad que diga (p. ej. una parte en efectivo y el resto con tarjeta)."""
    LIBRE
  }

  """Como se esta dividiendo la cuenta (fijo mientras haya partes cobradas)."""
  type OrderSplit {
    mode: SplitMode!
    """Solo a partes iguales: entre cuantas personas."""
    parts: Int
  }

  """Una parte de un cobro dividido."""
  type OrderPayment {
    amountCents: Int!
    method: PaymentMethod!
    """Solo en efectivo: lo que entrego esa persona."""
    cashReceivedCents: Int
    changeCents: Int
    """Solo por productos: lo que pago esa persona."""
    units: [OrderPaymentUnits!]!
    staffName: String
    at: String!
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
    """Lo que se cobra: productos + empaque - canje de sellos - descuento."""
    totalCents: Int!
    redemption: OrderRedemption
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
    """Quien lo cobro (en una cuenta compartida, la persona elegida al cobrar)."""
    paidByName: String
    paidByAvatar: String
    """Solo en efectivo, si se anoto al cobrar: lo que entrego el cliente."""
    cashReceivedCents: Int
    """El cambio que se devolvio (cashReceivedCents - totalCents); null si no se anoto lo recibido."""
    changeCents: Int
    """Cobro dividido: las partes cobradas, en orden. Vacio si se cobro de una vez."""
    payments: [OrderPayment!]!
    """Suma de las partes cobradas."""
    paidCents: Int!
    """Lo que falta por cobrar (0 si ya esta cobrado)."""
    remainingCents: Int!
    """Unidades ya pagadas de cada linea (misma posicion que items), al dividir por productos."""
    paidUnits: [Int!]!
    """Como se divide la cuenta; null si no hay partes cobradas."""
    split: OrderSplit
    """De mesa o barra, sin cobrar y no cancelado."""
    awaitingPayment: Boolean!
    createdAt: String!
    updatedAt: String!
    """Ultima modificacion (productos, mesa, nota...) antes de cobrarlo, y quien la hizo."""
    editedAt: String
    editedByName: String
  }

  input OrderLineInput {
    menuItemId: ID!
    quantity: Int!
    """Opciones elegidas. En los grupos sin eleccion se aplica la opcion por defecto del producto."""
    optionIds: [ID!]
  }

  input StaffOrderUpdateInput {
    items: [OrderLineInput!]!
    serviceType: ServiceType!
    table: String
    takeaway: Boolean
    customerId: ID
    note: String
    redemption: OrderRedemptionInput
    discount: OrderDiscountInput
  }

  input StaffOrderInput {
    items: [OrderLineInput!]!
    serviceType: ServiceType!
    """Obligatoria si serviceType es MESA."""
    table: String
    """Cliente registrado, si da su codigo o email (ver lookupCustomer)."""
    customerId: ID
    note: String
    """Mesa o barra, pero se lo llevan (empaquetado): lleva el recargo por empaque y descuenta
    vasos, tapas... como un pedido para llevar. Con serviceType LLEVAR no hace falta."""
    takeaway: Boolean
    """Guardar y pagar: ya se entrego y se cobra en el acto con este metodo. El pedido nace
    entregado y cobrado (cerrado), sin pasar por la cola."""
    paymentMethod: PaymentMethod
    """Solo con paymentMethod EFECTIVO: lo que entrega el cliente (debe cubrir el total)."""
    cashReceivedCents: Int
    """Guardar y dividir (solo mesa o barra, sin paymentMethod): ya se entrego y se cobra por
    partes con addOrderPayment. Queda servido sin cobrar hasta la ultima parte."""
    splitPayment: Boolean
    """Canje de sellos (ver OrderRedemptionInput)."""
    redemption: OrderRedemptionInput
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
    setOrderStatus(id: ID!, status: OrderStatus!, paymentMethod: PaymentMethod, cashReceivedCents: Int): Order!
    """Personal: cobra un pedido de mesa o barra (antes o despues de entregarlo)."""
    markOrderPaid(id: ID!, method: PaymentMethod!, cashReceivedCents: Int): Order!
    """Personal: cobra una parte de un pedido de mesa o barra (cuenta dividida). Por productos (units:
    lo que paga esa persona), a partes iguales (parts: entre cuantas; el importe lo calcula el
    servidor) o por cantidad libre (amountCents, hasta lo que falta). Con la ultima parte el pedido
    queda cobrado."""
    addOrderPayment(id: ID!, method: PaymentMethod!, cashReceivedCents: Int, units: [OrderPaymentUnitsInput!], parts: Int, amountCents: Int): Order!
    """Personal: deshace la ultima parte cobrada de un pedido aun sin cobrar del todo."""
    undoOrderPayment(id: ID!): Order!
    """Personal: pedido tomado en el local (mesero o barra). La recogida es ahora."""
    createStaffOrder(input: StaffOrderInput!): Order!
    """Personal: fija el canje de sellos y el descuento de un pedido aun sin cobrar (null: sin el).
    Se devuelven los sellos si se quita el canje."""
    setOrderDiscounts(id: ID!, redemption: OrderRedemptionInput, discount: OrderDiscountInput): Order!
    """Personal: asocia un cliente a un pedido activo que no tenia."""
    assignOrderCustomer(orderId: ID!, customerId: ID!): Order!
    """Gestion: elimina un pedido del historial (cerrado o cancelado) y deshace lo que genero:
    stock consumido, sellos, opinion y fotos. Devuelve el id borrado."""
    deleteOrder(id: ID!): ID!
    """Personal: modifica un pedido aun sin cobrar (no los web para recoger), como si se volviera
    a tomar. El total, el canje, el descuento y el stock (si ya se sirvio) se recalculan."""
    updateStaffOrder(id: ID!, input: StaffOrderUpdateInput!): Order!
  }

  extend type Subscription {
    """Personal: se dispara con cualquier alta o cambio de estado en la cola."""
    orderQueueUpdated: Order!
    """Cliente: se dispara cuando cambia el estado de uno de sus pedidos."""
    orderStatusChanged: Order!
  }
`;
