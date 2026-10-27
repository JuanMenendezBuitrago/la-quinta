export const settingsTypeDefs = /* GraphQL */ `
  type ScheduleLine {
    label: String!
    hours: String!
  }

  """Horario de un dia de la semana, en hora de la tienda."""
  type OpeningHours {
    """1 = lunes ... 7 = domingo."""
    weekday: Int!
    """HH:MM"""
    open: String!
    """HH:MM"""
    close: String!
  }

  input OpeningHoursInput {
    weekday: Int!
    open: String!
    close: String!
  }

  """Como se ganan los sellos al cerrar un pedido."""
  enum StampsMode {
    """stampsPerOrder sellos por pedido."""
    PEDIDO
    """stampsPerItem sellos por cada producto (2 cafes = 2 veces)."""
    PRODUCTO
    """Un sello por cada stampsAmountCents pesos pagados en productos (sin el recargo por empaque)."""
    IMPORTE
  }

  """Datos de contacto/redes que muestra el pie de pagina en toda la web."""
  type SiteSettings {
    address: String
    """URL del enlace "Cómo llegar" (Google Maps u otro). Sin ella, el enlace no se muestra."""
    addressMapUrl: String
    """Dias abiertos; el dia que no aparece, la tienda esta cerrada. Limita las horas de recogida."""
    openingHours: [OpeningHours!]!
    """Lineas para mostrar, generadas a partir de openingHours ("Lun – Vie", "7:00 – 19:00")."""
    schedule: [ScheduleLine!]!
    phone: String
    email: String
    """URL de cada red social. Vacia/null = ese icono no se muestra en el pie de pagina."""
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
    """Responsable del tratamiento de datos: razon social o nombre del titular del negocio."""
    legalName: String
    """NIT o cedula del responsable."""
    taxId: String
    """Email donde los clientes ejercen sus derechos sobre sus datos (si falta, se usa email)."""
    privacyEmail: String
    """
    Solo el personal crea pedidos: los clientes pueden ver la carta y sus pedidos, pero no
    anadir productos ni pedir (createOrder lo rechaza).
    """
    staffOnlyOrders: Boolean!
    """
    Cola de pedidos. Desactivada: el personal solo registra pedidos ya servidos y cobrados
    ("Guardar y pagar") y los clientes no pueden pedir desde la web.
    """
    orderQueueEnabled: Boolean!
    """Listado de "Personal" del panel: si muestra tambien las cuentas desactivadas."""
    showInactiveStaff: Boolean!
    """Recargo por empaque (pesos) que se suma una vez a cada pedido para llevar: los "Para llevar"
    del personal y los de recogida de la web (no los de mesa o barra). 0 = sin recargo."""
    packagingFeeCents: Int!
    """Boton "Imprimir ticket" en el panel: imprime en la impresora termica a traves de RawBT
    (app Android de la tablet, que tiene configurada la impresora)."""
    ticketPrintingEnabled: Boolean!
    """Sellos que hacen falta para canjear la recompensa (y los que se restan al canjearla).
    Cambiarlo no toca los sellos ya ganados ni los canjes ya hechos."""
    rewardThresholdStamps: Int!
    """Como se ganan los sellos; de los tres valores siguientes solo cuenta el del modo elegido."""
    stampsMode: StampsMode!
    stampsPerOrder: Int!
    stampsPerItem: Int!
    """Pesos pagados en productos por cada sello (modo IMPORTE)."""
    stampsAmountCents: Int!
  }

  input SiteSettingsInput {
    address: String
    addressMapUrl: String
    openingHours: [OpeningHoursInput!]
    phone: String
    email: String
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
    legalName: String
    taxId: String
    privacyEmail: String
    staffOnlyOrders: Boolean
    """No se puede desactivar con pedidos abiertos en la cola."""
    orderQueueEnabled: Boolean
    showInactiveStaff: Boolean
    packagingFeeCents: Int
    ticketPrintingEnabled: Boolean
    """Entre 1 y 50."""
    rewardThresholdStamps: Int
    stampsMode: StampsMode
    """Entre 1 y 10."""
    stampsPerOrder: Int
    """Entre 1 y 10."""
    stampsPerItem: Int
    """Entre 1.000 y 1.000.000."""
    stampsAmountCents: Int
  }

  extend type Query {
    """Publica: la usa el pie de pagina en toda la web, sin necesitar sesion."""
    siteSettings: SiteSettings!
  }

  extend type Mutation {
    """Requiere rol gestion. Solo actualiza los campos presentes en el input."""
    updateSiteSettings(input: SiteSettingsInput!): SiteSettings!
  }
`;
