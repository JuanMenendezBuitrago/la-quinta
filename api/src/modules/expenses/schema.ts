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

  """Articulo del desglose de un gasto (agrupado)."""
  type ExpenseItem {
    name: String!
    quantity: Float
    amountCents: Int!
  }

  input ExpenseItemInput {
    name: String!
    quantity: Float
    amountCents: Int!
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
    """Compra de varios articulos apuntada por su total, para desglosar despues."""
    grouped: Boolean!
    """Desglose por articulos (nunca suma mas que amountCents)."""
    items: [ExpenseItem!]!
    """Lo que falta por desglosar: amountCents menos la suma de items (0 si no es agrupado y no tiene items)."""
    unitemizedCents: Int!
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
    grouped: Boolean
    """ISO; sin el, ahora."""
    spentAt: String
  }

  extend type Query {
    """Personal: gastos que aun no estan en ningun cierre (los del cierre que se haria ahora)."""
    pendingExpenses: [Expense!]!
    """Personal: gastos de un cierre del historial."""
    closingExpenses(closingId: ID!): [Expense!]!
    """Personal: proveedores ya usados en gastos (los mas usados primero), para autocompletar."""
    expenseSuppliers: [String!]!
    """Personal: gastos agrupados ya cerrados que aun no estan desglosados del todo (los mas recientes primero)."""
    expensesToItemize: [Expense!]!
  }

  extend type Mutation {
    """Personal (barra y gestion): registra un gasto."""
    createExpense(input: ExpenseInput!): Expense!
    """Gestion: corrige un gasto aun no cerrado."""
    updateExpense(id: ID!, input: ExpenseInput!): Expense!
    """Gestion: borra un gasto aun no cerrado (y la foto de su recibo)."""
    deleteExpense(id: ID!): Boolean!
    """Personal (barra y gestion): guarda el desglose por articulos de un gasto, tambien si ya esta cerrado.
    Sustituye la lista entera; no cambia el importe del gasto."""
    setExpenseItems(id: ID!, items: [ExpenseItemInput!]!): Expense!
  }
`;
