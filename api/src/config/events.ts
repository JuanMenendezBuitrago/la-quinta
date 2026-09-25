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
  // Al entregar: sale la mercancia (inventario).
  ORDER_DELIVERED: "order.delivered",
  // Al cerrar: entregado y, si es de mesa o barra, cobrado (sellos y hoja de Google).
  ORDER_COMPLETED: "order.completed",
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

/**
 * Instantanea de un pedido entregado o cancelado. Viaja en ORDER_DELIVERED (al entregar),
 * ORDER_COMPLETED (al cerrar) y ORDER_CANCELLED.
 */
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
  // options: personalizaciones que no son las de por defecto ("Avena"), para mostrarlas.
  // optionSwaps: esas mismas, con la opcion por defecto a la que sustituyen (para el inventario).
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    priceCents: number;
    options?: string[];
    optionSwaps?: { fromOptionId: string | null; toOptionId: string }[];
  }[];
  pickupSlot: string;
  // Origen del pedido: WEB (el cliente, para recoger o desde su mesa) o STAFF (el personal).
  source?: "WEB" | "STAFF";
  serviceType?: "MESA" | "LLEVAR" | null;
  table?: string | null;
  closedAt: string | null; // hora de entrega o cancelacion; null si no se conoce (pedidos antiguos)
  paidAt?: string | null; // solo pedidos de mesa y barra
  paymentMethod?: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | null;
}

export type OrderDeliveredPayload = OrderClosedPayload & { status: "ENTREGADO" };
export type OrderCancelledPayload = OrderClosedPayload & { status: "CANCELADO" };
