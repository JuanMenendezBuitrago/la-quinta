export const expensesTypeDefs = /* GraphQL */ `
  """CAJA: pagado con el efectivo del cajon (resta del arqueo). El resto no sale de la caja."""
  enum ExpenseMethod {
    CAJA
    TARJETA
    TRANSFERENCIA
    OTRO
  }

  enum ExpenseCategory {
    INSUMOS
    SERVICIOS
    MANTENIMIENTO
    PERSONAL
    ALQUILER
    OTROS
  }

  """Gasto de operacion. Entra en el siguiente cierre de caja; despues ya no se puede editar ni borrar."""
  type Expense {
    id: ID!
    amountCents: Int!
    method: ExpenseMethod!
    category: ExpenseCategory!
    description: String!
    supplier: String
    """Foto del recibo (/uploads/receipts/...), si se subio."""
    receiptUrl: String
    """Fecha del gasto (la de la factura)."""
    spentAt: String!
    staffName: String!
    """Cierre de caja en que entro; null mientras esta pendiente."""
    closingId: ID
    createdAt: String!
  }

  input ExpenseInput {
    amountCents: Int!
    method: ExpenseMethod!
    category: ExpenseCategory!
    description: String!
    supplier: String
    receiptUrl: String
    """ISO; sin el, ahora."""
    spentAt: String
  }

  extend type Query {
    """Personal: gastos que aun no estan en ningun cierre (los del cierre que se haria ahora)."""
    pendingExpenses: [Expense!]!
    """Personal: gastos de un cierre del historial."""
    closingExpenses(closingId: ID!): [Expense!]!
  }

  extend type Mutation {
    """Personal (barra y gestion): registra un gasto."""
    createExpense(input: ExpenseInput!): Expense!
    """Gestion: corrige un gasto aun no cerrado."""
    updateExpense(id: ID!, input: ExpenseInput!): Expense!
    """Gestion: borra un gasto aun no cerrado (y la foto de su recibo)."""
    deleteExpense(id: ID!): Boolean!
  }
`;
