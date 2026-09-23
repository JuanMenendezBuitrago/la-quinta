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

  extend type Query {
    """Saldo de sellos e historial del cliente autenticado."""
    myLoyaltyStatus: LoyaltyStatus!
  }

  extend type Mutation {
    """Canjea la recompensa si el cliente tiene sellos suficientes."""
    redeemLoyaltyReward: LoyaltyStatus!
  }
`;
