export const cashTypeDefs = /* GraphQL */ `
  """Descuentos de un motivo en el periodo."""
  type DiscountTotal {
    reason: DiscountReason!
    count: Int!
    amountCents: Int!
  }

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
    """Descuentos de los pedidos cobrados (ya restados del total): cuantos, cuanto y por motivo."""
    discountsCount: Int!
    discountsCents: Int!
    discountsByReason: [DiscountTotal!]!
    """Gastos pendientes (los que entrarian en el cierre) o del cierre: numero, pagados de la caja y el resto."""
    expensesCount: Int!
    expensesCashCents: Int!
    expensesOtherCents: Int!
    expensesTotalCents: Int!
    """Por metodo: lo cobrado, lo pagado y el saldo (para cuadrar con el cajon, el datafono o el banco)."""
    balances: [MethodBalance!]!
    """Cobrado menos gastos."""
    netCents: Int!
  }

"""Saldo de un metodo en el periodo. EFECTIVO: cobrado en efectivo y gastos pagados de la caja.
  OTRO: cobrado sin metodo (pedidos antiguos) y gastos con metodo Otro."""
  type MethodBalance {
    method: String!
    inCents: Int!
    outCents: Int!
    balanceCents: Int!
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
    """Descuentos de los pedidos cobrados (ya restados del total): cuantos, cuanto y por motivo."""
    discountsCount: Int!
    discountsCents: Int!
    discountsByReason: [DiscountTotal!]!
    """Gastos pendientes (los que entrarian en el cierre) o del cierre: numero, pagados de la caja y el resto."""
    expensesCount: Int!
    expensesCashCents: Int!
    expensesOtherCents: Int!
    expensesTotalCents: Int!
    """Por metodo: lo cobrado, lo pagado y el saldo (para cuadrar con el cajon, el datafono o el banco)."""
    balances: [MethodBalance!]!
    """Cobrado menos gastos."""
    netCents: Int!
    openingFloatCents: Int!
    countedCashCents: Int!
    """Fondo inicial + efectivo cobrado - gastos pagados de la caja: lo que deberia haber en el cajon."""
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
