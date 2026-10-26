export const loyaltyTypeDefs = /* GraphQL */ `
  type LoyaltyTransaction {
    id: ID!
    stamps: Int!
    reason: String!
    createdAt: String!
  }

  type LoyaltyStatus {
    balance: Int!
    rewardThreshold: Int!
    rewardAvailable: Boolean!
    history: [LoyaltyTransaction!]!
  }

  extend type Customer {
    """Si tiene sellos para canjear la recompensa (p. ej. como descuento "Canje de sellos" del pedido)."""
    rewardAvailable: Boolean!
    """Sellos que tiene ahora (para el ticket impreso)."""
    stampsBalance: Int!
  }

  extend type CustomerMatch {
    rewardAvailable: Boolean!
  }

  extend type Query {
    """Saldo de sellos e historial del cliente autenticado."""
    myLoyaltyStatus: LoyaltyStatus!
  }

  extend type Mutation {
    """Personal (barra y gestion): suma (positivo) o resta (negativo) sellos a un cliente. El motivo es obligatorio."""
    adjustCustomerStamps(customerId: ID!, stamps: Int!, note: String!): LoyaltyStatus!
  }
`;
