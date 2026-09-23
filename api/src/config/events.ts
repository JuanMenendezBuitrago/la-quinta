import { EventEmitter } from "events";

/**
 * Bus de eventos interno del monolito modular.
 *
 * Los modulos NO se importan directamente entre si (p. ej. "orders" no
 * conoce el modelo de "loyalty"): cuando algo relevante ocurre, publican
 * un evento aqui y el modulo interesado se suscribe por su cuenta. Es lo
 * que permite, mas adelante, extraer un modulo a su propio servicio sin
 * tener que desenredar imports cruzados.
 */
export const internalEvents = new EventEmitter();

export const INTERNAL_EVENTS = {
  ORDER_DELIVERED: "order.delivered",
  ORDER_CANCELLED: "order.cancelled",
  CUSTOMER_DELETED: "customer.deleted",
} as const;

/** Nombre que sustituye al del titular en todo lo que se conserva tras suprimir su cuenta. */
export const DELETED_CUSTOMER_NAME = "Cliente eliminado";

/** El titular ha suprimido su cuenta: cada modulo borra o anonimiza lo que tenga suyo. */
export interface CustomerDeletedPayload {
  customerId: string;
  customerCode: string;
}

/** Pedido que ha llegado a un estado final (ENTREGADO o CANCELADO). */
export interface OrderClosedPayload {
  status: "ENTREGADO" | "CANCELADO";
  orderId: string;
  customerId: string | null; // null: pedido del personal sin cliente registrado
  totalCents: number;
  // Instantanea del pedido para los modulos que necesitan registrarlo (p. ej. "sheets")
  // sin tener que importar los modelos de "orders" o "users".
  code: string;
  customerName: string;
  customerCode: string;
  items: { name: string; quantity: number; priceCents: number }[];
  pickupSlot: string;
  // Origen del pedido: WEB (el cliente) o STAFF (el personal, en mesa o para llevar).
  source?: "WEB" | "STAFF";
  serviceType?: "MESA" | "LLEVAR" | null;
  table?: string | null;
  closedAt: string | null; // null si no se conoce (pedidos antiguos exportados a posteriori)
}

export type OrderDeliveredPayload = OrderClosedPayload & { status: "ENTREGADO" };
export type OrderCancelledPayload = OrderClosedPayload & { status: "CANCELADO" };
