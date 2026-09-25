/** Valor de `table` para los pedidos servidos en la barra (servicio MESA, sin numero de mesa). */
export const BAR_TABLE = "Barra";

// El local: 6 mesas y la barra. La API admite las mismas (orders/model.ts, CUSTOMER_TABLES).
const TABLE_COUNT = 6;
export const TABLES = [
  ...Array.from({ length: TABLE_COUNT }, (_, i) => ({ id: String(i + 1), label: `Mesa ${i + 1}` })),
  { id: BAR_TABLE, label: "Barra" },
];

export function tableLabel(table: string) {
  return TABLES.find((t) => t.id === table)?.label ?? `Mesa ${table}`;
}

/**
 * Mesa desde la que pide el cliente si esta en el local; vacio si es para recoger.
 * Se fija al elegirla en el carrito o al entrar con ?mesa=3 (p. ej. desde un QR en la mesa)
 * y se mantiene mientras navega por la carta.
 */
export function useCustomerTable() {
  return useState<string>("customer-table", () => "");
}
