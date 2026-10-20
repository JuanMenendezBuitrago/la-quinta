export const reviewsTypeDefs = /* GraphQL */ `
  """Opinion de un cliente sobre un pedido o, sin pedido, sobre el local en general."""
  type Review {
    id: ID!
    """Null: opinion general sobre el local."""
    orderId: ID
    """Codigo del pedido (P-...), si es sobre un pedido."""
    orderCode: String
    rating: Int!
    comment: String
    createdAt: String!
    updatedAt: String!
  }

  """Opinion vista desde el panel de gestion: con el cliente."""
  type StaffReview {
    id: ID!
    orderId: ID
    orderCode: String
    rating: Int!
    comment: String
    customerName: String!
    customerAvatar: String
    createdAt: String!
    updatedAt: String!
  }

  type ReviewStats {
    count: Int!
    """Media de 1 a 5 (0 sin opiniones)."""
    average: Float!
    """Cuantas hay de 1, 2, 3, 4 y 5 estrellas, en ese orden."""
    distribution: [Int!]!
  }

  type ReviewPage {
    total: Int!
    items: [StaffReview!]!
  }

  enum ReviewKind {
    ALL
    ORDER
    GENERAL
  }

  extend type Query {
    """Cliente: sus opiniones (la general y las de sus pedidos)."""
    myReviews: [Review!]!
    """Gestion: opiniones, las mas recientes primero; rating filtra por estrellas."""
    reviews(kind: ReviewKind, rating: Int, limit: Int, offset: Int): ReviewPage!
    """Gestion: media y reparto de estrellas."""
    reviewStats(kind: ReviewKind): ReviewStats!
  }

  extend type Mutation {
    """Cliente: crea o edita su opinion. Con orderId, sobre ese pedido (suyo y entregado);
    sin el, sobre el local en general."""
    submitReview(orderId: ID, rating: Int!, comment: String): Review!
  }
`;
