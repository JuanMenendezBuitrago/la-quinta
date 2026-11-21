export const cashTypeDefs = /* GraphQL */ `
  """Descuentos de un motivo en el periodo."""
  type DiscountTotal {
    reason: DiscountReason!
    count: Int!
    amountCents: Int!
  }

  """Lo cobrado en un periodo, por metodo de pago (pesos). Sin los pedidos cancelados."""
  type CashSummary {
    """Fin del ultimo cierre (o el primer pedido, si aun no hay ninguno)."""
    periodStart: String!
    """Fondo inicial anotado al abrir la caja en este periodo (null si aun no se anoto)."""
    openingFloatCents: Int
    openingFloatStaffName: String
    openingFloatAt: String
    """Lo mismo dia a dia (en la zona horaria del local), el mas reciente primero; solo los dias con algo."""
    days: [CashSummaryDay!]!
    periodEnd: String!
    ordersCount: Int!
    totalCents: Int!
    cashCents: Int!
    cardCents: Int!
    transferCents: Int!
    """Pedidos para llevar o web entregados sin indicar el metodo (anteriores a pedirlo al entregar)."""
    unknownMethodCents: Int!
    """Descuentos y canjes de sellos de los pedidos cobrados (ya restados del total): en cuantos pedidos, cuanto y por motivo."""
    discountsCount: Int!
    discountsCents: Int!
    discountsByReason: [DiscountTotal!]!
    """Retiros del cajon para ingresar en el banco: restan del arqueo, no son gasto."""
    bankDepositsCount: Int!
    bankDepositsCents: Int!
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
    """Descuentos y canjes de sellos de los pedidos cobrados (ya restados del total): en cuantos pedidos, cuanto y por motivo."""
    discountsCount: Int!
    discountsCents: Int!
    discountsByReason: [DiscountTotal!]!
    """Retiros del cajon para ingresar en el banco: restan del arqueo, no son gasto."""
    bankDepositsCount: Int!
    bankDepositsCents: Int!
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
    """Fondo inicial + efectivo cobrado - gastos pagados de la caja - ingresos al banco: lo que deberia haber en el cajon."""
    expectedCashInDrawerCents: Int!
    """Contado - esperado: negativo = falta dinero, positivo = sobra."""
    differenceCents: Int!
    note: String
    createdAt: String!
  }

  """Un dia del periodo actual: lo cobrado por metodo, los pedidos cobrados del todo y los gastos (sin ingresos al banco)."""
  type CashSummaryDay {
    """YYYY-MM-DD"""
    date: String!
    ordersCount: Int!
    totalCents: Int!
    cashCents: Int!
    cardCents: Int!
    transferCents: Int!
    unknownMethodCents: Int!
    expensesCents: Int!
  }

  """Un dia (en la zona horaria del local): lo cobrado, los gastos y los pedidos cobrados."""
  type CashDay {
    """YYYY-MM-DD"""
    date: String!
    incomeCents: Int!
    expensesCents: Int!
    ordersCount: Int!
  }

  extend type Query {
    """Personal: lo cobrado desde el ultimo cierre hasta ahora (lo que cerraria un cierre ahora)."""
    cashSummary: CashSummary!
    """Personal: aun no se ha anotado el fondo inicial del periodo actual (para avisar en la barra)."""
    cashOpeningPending: Boolean!
    """Personal: cierres anteriores, el mas reciente primero."""
    cashClosings(limit: Int): [CashClosing!]!
    """Personal: los ultimos dias (30 por defecto, hasta 90), hoy incluido; los dias sin nada, a cero."""
    cashDailyStats(days: Int): [CashDay!]!
  }

  extend type Mutation {
    """Personal: cierra la caja desde el ultimo cierre hasta ahora con el arqueo del efectivo."""
    closeCashRegister(openingFloatCents: Int, countedCashCents: Int!, note: String): CashClosing!
    """Personal: anota (o corrige) el fondo inicial del periodo actual, al abrir la caja."""
    setOpeningFloat(amountCents: Int!): CashSummary!
  }
`;
