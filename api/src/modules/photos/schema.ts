export const photosTypeDefs = /* GraphQL */ `
  enum ProductPhotoStatus {
    PENDIENTE
    APROBADA
    RECHAZADA
  }

  """Foto de un cliente aprobada, para la ficha del producto en la carta."""
  type ProductPhoto {
    id: ID!
    url: String!
    """Nombre e inicial del apellido ("Ana T."); null si el cliente suprimio su cuenta."""
    authorLabel: String
    createdAt: String!
  }

  """Foto enviada por el cliente autenticado, con su estado."""
  type MyProductPhoto {
    id: ID!
    """Null si se rechazo (el archivo se borra)."""
    url: String
    menuItemName: String!
    orderCode: String
    status: ProductPhotoStatus!
    rejectReason: String
    createdAt: String!
  }

  """Foto vista desde la moderacion (gestion)."""
  type StaffProductPhoto {
    id: ID!
    url: String
    menuItemId: ID!
    menuItemName: String!
    orderCode: String
    customerName: String!
    customerCode: String
    status: ProductPhotoStatus!
    rejectReason: String
    """Si dio el sello de foto aprobada (uno por producto y pedido)."""
    stampAwarded: Boolean!
    """Si se uso como foto principal del producto."""
    usedAsMain: Boolean!
    reviewedByName: String
    reviewedAt: String
    createdAt: String!
  }

  type StaffProductPhotoPage {
    total: Int!
    items: [StaffProductPhoto!]!
  }

  extend type Query {
    """Publica: fotos de clientes aprobadas de un producto, las mas recientes primero."""
    productPhotos(menuItemId: ID!, limit: Int): [ProductPhoto!]!
    """Cliente: las fotos que ha enviado, las mas recientes primero."""
    myProductPhotos: [MyProductPhoto!]!
    """Gestion: fotos por estado (pendientes: las mas antiguas primero)."""
    productPhotosForReview(status: ProductPhotoStatus!, limit: Int, offset: Int): StaffProductPhotoPage!
    """Gestion: cuantas fotos esperan moderacion (contador del menu del panel)."""
    pendingProductPhotosCount: Int!
  }

  extend type Mutation {
    """Cliente: retira una foto suya (se borra, este como este)."""
    withdrawProductPhoto(id: ID!): Boolean!
    """
    Gestion: aprueba (approve true) o rechaza una foto. Al aprobar da un sello al cliente (uno por
    producto y pedido); con setAsMain, ademas la pone como foto principal del producto. Al
    rechazar (reason opcional) se borra el archivo. Una aprobada se puede rechazar despues para
    retirarla de la carta.
    """
    moderateProductPhoto(id: ID!, approve: Boolean!, reason: String, setAsMain: Boolean): StaffProductPhoto!
  }
`;
