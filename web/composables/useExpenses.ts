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

export interface ExpensePreset {
  description: string;
  category: ExpenseCategory;
}

// Atajos del formulario: los gastos agrupados mas usados (los da la API) y, para completar hasta
// MAX_PRESETS mientras no haya bastantes, estos de partida.
export const MAX_PRESETS = 4;
export const DEFAULT_PRESETS: ExpensePreset[] = [
  { description: "Materias primas", category: "INSUMOS" },
  { description: "Compras en el supermercado", category: "INSUMOS" },
];

export function mergePresets(used: ExpensePreset[]): ExpensePreset[] {
  const seen = new Set(used.map((p) => p.description.toLowerCase()));
  const defaults = DEFAULT_PRESETS.filter((p) => !seen.has(p.description.toLowerCase()));
  return [...used, ...defaults].slice(0, MAX_PRESETS);
}

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
