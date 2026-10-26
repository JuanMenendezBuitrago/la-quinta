// Gastos de operacion (ver api/src/modules/expenses): tipos y etiquetas compartidos por el
// formulario y por la seccion de cierre de caja.
export type ExpenseMethod = "CAJA" | "TARJETA" | "TRANSFERENCIA" | "OTRO";
export type ExpenseCategory = "INSUMOS" | "SERVICIOS" | "MANTENIMIENTO" | "PERSONAL" | "ALQUILER" | "OTROS";

export interface Expense {
  id: string;
  amountCents: number;
  method: ExpenseMethod;
  category: ExpenseCategory;
  description: string;
  supplier: string | null;
  receiptUrl: string | null;
  spentAt: string;
  staffName: string;
  closingId: string | null;
}

export const EXPENSE_FIELDS = `id amountCents method category description supplier receiptUrl spentAt staffName closingId`;

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  CAJA: "Efectivo de la caja",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  INSUMOS: "Insumos",
  SERVICIOS: "Servicios",
  MANTENIMIENTO: "Mantenimiento",
  PERSONAL: "Personal",
  ALQUILER: "Alquiler",
  OTROS: "Otros",
};
