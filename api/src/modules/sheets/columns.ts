import { env } from "../../config/env";
import type { OrderClosedPayload } from "../../config/events";
import type { SheetsCell, SheetsExportKind } from "./model";

// "2026-09-23 14:05": Google Sheets lo reconoce como fecha/hora en cualquier configuracion regional.
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: env.storeTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Las filas se envian con USER_ENTERED (para que las fechas y numeros sean tipados), asi que
 * un nombre como "=IMPORTXML(...)" se interpretaria como formula: el apostrofo lo fuerza a texto.
 */
function text(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** "Web", "Mesa 7" o "Para llevar". Vacio en pedidos encolados antes de guardar el origen. */
export function originLabel(p: Pick<OrderClosedPayload, "source" | "serviceType" | "table">): string {
  if (p.serviceType === "MESA") return text(`Mesa ${p.table ?? ""}`.trim());
  if (p.serviceType === "LLEVAR") return "Para llevar";
  if (p.source === "WEB") return "Web";
  return "";
}

interface Column {
  title: string;
  value: (p: OrderClosedPayload) => SheetsCell;
}

const CLOSED_AT_TITLE: Record<SheetsExportKind, string> = {
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

/**
 * Columnas de cada pestaña, en orden. Es la unica fuente de verdad: la cabecera y las filas
 * salen de aqui, y al arrancar se reordenan las columnas de la hoja para que coincidan
 * (ver ensureSheet en client.ts). Para cambiar el orden basta con mover lineas.
 */
export function sheetColumns(kind: SheetsExportKind): Column[] {
  return [
    { title: "ID pedido", value: (p) => p.orderId },
    { title: "Código pedido", value: (p) => p.code },
    { title: "Código cliente", value: (p) => p.customerCode },
    { title: CLOSED_AT_TITLE[kind], value: (p) => (p.closedAt ? dateFormatter.format(new Date(p.closedAt)) : "") },
    { title: "Recogida", value: (p) => dateFormatter.format(new Date(p.pickupSlot)) },
    { title: "Origen", value: originLabel },
    { title: "Cliente", value: (p) => text(p.customerName) },
    { title: "Productos", value: (p) => text(p.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")) },
    { title: "Unidades", value: (p) => p.items.reduce((sum, i) => sum + i.quantity, 0) },
    // pesos colombianos sin decimales: en la carta, priceCents son pesos
    { title: "Total (COP)", value: (p) => p.totalCents },
  ];
}

export function sheetHeader(kind: SheetsExportKind): string[] {
  return sheetColumns(kind).map((c) => c.title);
}

export function buildRow(kind: SheetsExportKind, payload: OrderClosedPayload): SheetsCell[] {
  return sheetColumns(kind).map((c) => c.value(payload));
}
