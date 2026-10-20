export const cashTypeDefs = /* GraphQL */ `
  """Lo cobrado en un periodo, por metodo de pago (pesos). Sin los pedidos cancelados."""
  type CashSummary {
    """Fin del ultimo cierre (o inicio del dia, en la zona horaria del local, si aun no hay ninguno)."""
    periodStart: String!
    periodEnd: String!
    ordersCount: Int!
    totalCents: Int!
    cashCents: Int!
    cardCents: Int!
    transferCents: Int!
    """Pedidos para llevar o web entregados sin indicar el metodo (anteriores a pedirlo al entregar)."""
    unknownMethodCents: Int!
  }

  type CashClosing {
    id: ID!
    periodStart: String!
    periodEnd: String!
    staffName: String!
    ordersCount: Int!
    totalCents: Int!
    cashCents: Int!
    cardCents: Int!
    transferCents: Int!
    unknownMethodCents: Int!
    openingFloatCents: Int!
    countedCashCents: Int!
    """Fondo inicial + efectivo cobrado: lo que deberia haber en el cajon."""
    expectedCashInDrawerCents: Int!
    """Contado - esperado: negativo = falta dinero, positivo = sobra."""
    differenceCents: Int!
    note: String
    createdAt: String!
  }

  extend type Query {
    """Personal: lo cobrado desde el ultimo cierre hasta ahora (lo que cerraria un cierre ahora)."""
    cashSummary: CashSummary!
    """Personal: cierres anteriores, el mas reciente primero."""
    cashClosings(limit: Int): [CashClosing!]!
  }

  extend type Mutation {
    """Personal: cierra la caja desde el ultimo cierre hasta ahora con el arqueo del efectivo."""
    closeCashRegister(openingFloatCents: Int!, countedCashCents: Int!, note: String): CashClosing!
  }
`;
