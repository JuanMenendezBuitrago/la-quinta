// Gastos de operacion (ver api/src/modules/expenses): tipos y etiquetas compartidos por el
// formulario y por la seccion de cierre de caja.
export type ExpenseMethod = "CAJA" | "TARJETA" | "TRANSFERENCIA" | "OTRO";
export type ExpenseCategory = "INSUMOS" | "SERVICIOS" | "MANTENIMIENTO" | "PERSONAL" | "ALQUILER" | "OTROS";

export interface ExpenseItem {
  name: string;
  quantity: number | null;
  amountCents: number;
}

export interface Expense {
  id: string;
  amountCents: number;
  method: ExpenseMethod;
  category: ExpenseCategory;
  description: string;
  supplier: string | null;
  receiptUrl: string | null;
  // Compra de varios articulos apuntada por su total, para desglosar despues en items.
  grouped: boolean;
  items: ExpenseItem[];
  // Lo que falta por desglosar (0 si no es agrupado ni tiene items).
  unitemizedCents: number;
  spentAt: string;
  staffName: string;
  closingId: string | null;
}

export const EXPENSE_FIELDS = `id amountCents method category description supplier receiptUrl grouped items { name quantity amountCents } unitemizedCents
  spentAt staffName closingId`;

// Atajos del formulario: gastos agrupados habituales, para apuntarlos rapido en el cierre.
export const GROUPED_PRESETS: { description: string; category: ExpenseCategory }[] = [
  { description: "Materias primas", category: "INSUMOS" },
  { description: "Compras en el supermercado", category: "INSUMOS" },
];

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
