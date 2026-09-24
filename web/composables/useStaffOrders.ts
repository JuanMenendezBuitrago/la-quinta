import { gql } from "graphql-tag";
import type { ComputedRef, Ref } from "vue";
import { playNewOrderChime } from "./useOrderChime";
import { useOrderNotifications } from "./useOrderNotifications";

/** Cliente identificado por el personal (lookupCustomer): solo nombre y codigo, sin contacto. */
/** Valor de `table` para los pedidos servidos en la barra (servicio MESA, sin numero de mesa). */
export const BAR_TABLE = "Barra";

export interface CustomerMatch {
  id: string;
  name: string;
  customerCode: string;
}

// Campos compartidos por la cola en vivo y el historial: mismo tipo `Order` en ambos casos.
const ORDER_FIELDS = `
  id
  code
  source
  serviceType
  table
  note
  status
  pickupSlot
  updatedAt
  customer {
    name
    customerCode
  }
  items {
    name
    quantity
  }
`;

const QUEUE_QUERY = gql`query OrderQueue { orderQueue { ${ORDER_FIELDS} } }`;
const QUEUE_SUBSCRIPTION = gql`subscription OrderQueueUpdated { orderQueueUpdated { ${ORDER_FIELDS} } }`;
const HISTORY_QUERY = gql`query OrderHistory($limit: Int) { orderHistory(limit: $limit) { ${ORDER_FIELDS} } }`;

const SET_STATUS = gql`
  mutation SetOrderStatus($id: ID!, $status: OrderStatus!) {
    setOrderStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

const ASSIGN_CUSTOMER = gql`
  mutation AssignOrderCustomer($orderId: ID!, $customerId: ID!) {
    assignOrderCustomer(orderId: $orderId, customerId: $customerId) {
      id
      customer {
        name
        customerCode
      }
    }
  }
`;

const STATUS_ORDER = ["NUEVO", "EN_PREPARACION", "LISTO"] as const;
const STATUS_LABELS: Record<string, string> = {
  NUEVO: "Nuevos",
  EN_PREPARACION: "En preparación",
  LISTO: "Listos para recoger",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
const NEXT_STATUS: Record<string, string> = {
  NUEVO: "EN_PREPARACION",
  EN_PREPARACION: "LISTO",
  LISTO: "ENTREGADO",
};
const NEXT_LABEL: Record<string, string> = {
  NUEVO: "Empezar a preparar",
  EN_PREPARACION: "Marcar listo",
  LISTO: "Marcar entregado",
};

/**
 * Centraliza la cola de pedidos en vivo y el historial bajo demanda del panel de personal,
 * para que `staff/index.vue` no acumule cada vez mas "wiring" de queries a medida que crece
 * con nuevas pestañas.
 */
export function useStaffOrders(enabled: Ref<boolean> | ComputedRef<boolean>) {
  // --- Cola en vivo (query inicial + subscription) ---
  const orders = ref<any[]>([]);
  const {
    permission: notificationPermission,
    requestPermission: requestNotificationPermission,
    showNewOrderNotification,
  } = useOrderNotifications();

  // Apollo devuelve (y congela con Object.freeze) los arrays/objetos que salen de su cache:
  // por eso aqui nunca se mutan `orders.value` ni sus elementos en sitio (.push/.splice/[i]=),
  // siempre se reemplaza por un array u objeto nuevo. Mutar un array congelado no avisa con
  // un error visible: la excepcion queda atrapada dentro del observable de Apollo y la unica
  // señal es que la cola deja de actualizarse en vivo sin explicacion.
  const { onResult, refetch: refetchQueue } = useQuery(QUEUE_QUERY, null, () => ({ enabled: enabled.value }));
  onResult((r: any) => {
    if (r.data?.orderQueue) orders.value = [...r.data.orderQueue];
  });

  const { onResult: onQueueUpdate, onError: onQueueError } = useSubscription(QUEUE_SUBSCRIPTION, null, () => ({
    enabled: enabled.value,
  }));
  onQueueError((err: any) => {
    // eslint-disable-next-line no-console
    console.error("[useStaffOrders] error en la suscripcion de la cola", err);
  });
  onQueueUpdate((r: any) => {
    const updated = r.data?.orderQueueUpdated;
    if (!updated) return;
    const idx = orders.value.findIndex((o) => o.id === updated.id);

    if (["ENTREGADO", "CANCELADO"].includes(updated.status)) {
      if (idx >= 0) orders.value = orders.value.filter((o) => o.id !== updated.id);
      return;
    }
    if (idx >= 0) {
      // Cambio de estado de un pedido ya visible: se conserva el flag `_isNew` que pudiera
      // tener (por si el pulso de "nuevo" seguia activo) en vez de perderlo al reemplazar.
      const next = orders.value.slice();
      next[idx] = { ...updated, _isNew: orders.value[idx]._isNew };
      orders.value = next;
      return;
    }
    // Alta real (el id no estaba en la cola): aviso sonoro + notificacion + pulso visual temporal.
    orders.value = [...orders.value, { ...updated, _isNew: true }];
    playNewOrderChime();
    showNewOrderNotification(updated);
    setTimeout(() => {
      const i = orders.value.findIndex((o) => o.id === updated.id);
      if (i < 0) return;
      const next = orders.value.slice();
      next[i] = { ...next[i], _isNew: false };
      orders.value = next;
    }, 3000);
  });

  const groupedQueue = computed(() =>
    STATUS_ORDER.map((status) => ({
      status,
      orders: orders.value.filter((o) => o.status === status),
    }))
  );

  // --- Historial (bajo demanda, sin subscription) ---
  const historyOrders = ref<any[]>([]);
  const historyLoading = ref(false);
  const historyLoaded = ref(false);

  async function loadHistory() {
    if (historyLoaded.value || historyLoading.value) return;
    historyLoading.value = true;
    try {
      const { defaultClient } = useNuxtApp().$apollo;
      const { data } = await defaultClient.query({
        query: HISTORY_QUERY,
        variables: { limit: 50 },
        fetchPolicy: "network-only",
      });
      historyOrders.value = data?.orderHistory ? [...data.orderHistory] : [];
      historyLoaded.value = true;
    } finally {
      historyLoading.value = false;
    }
  }

  // --- Cambios de estado (avanzar / cancelar) ---
  const { mutate: setStatus } = useMutation(SET_STATUS);

  function nextStatus(status: string) {
    return NEXT_STATUS[status];
  }
  function nextStatusLabel(status: string) {
    return NEXT_LABEL[status];
  }
  // Pedido con un cambio de estado en curso: sus botones se desactivan para evitar el doble clic.
  const busyOrderId = ref("");
  const actionError = ref("");

  /**
   * La API rechaza las transiciones no validas (p. ej. si otra persona ya movio el pedido):
   * se muestra el motivo y se recarga la cola para ver el estado real. Devuelve si se aplico.
   */
  async function changeStatus(order: any, status: string) {
    if (busyOrderId.value) return false;
    busyOrderId.value = order.id;
    actionError.value = "";
    try {
      await setStatus({ id: order.id, status });
      return true;
    } catch (err: any) {
      actionError.value = err?.message ?? "No se pudo cambiar el estado del pedido";
      await refetchQueue()?.catch(() => {});
      return false;
    } finally {
      busyOrderId.value = "";
    }
  }
  async function advance(order: any) {
    const status = nextStatus(order.status);
    if (!status) return false;
    return changeStatus(order, status);
  }
  async function cancelOrder(order: any) {
    return changeStatus(order, "CANCELADO");
  }

  // Asociar cliente a un pedido tomado sin el (para que los sellos vayan a su cuenta). La cola
  // se actualiza sola con la suscripcion; si falla, mismo aviso que un cambio de estado rechazado.
  const { mutate: assignCustomerMutation } = useMutation(ASSIGN_CUSTOMER);
  async function assignCustomer(order: any, customer: CustomerMatch) {
    if (busyOrderId.value) return false;
    busyOrderId.value = order.id;
    actionError.value = "";
    try {
      await assignCustomerMutation({ orderId: order.id, customerId: customer.id });
      return true;
    } catch (err: any) {
      actionError.value = err?.message ?? "No se pudo asignar el cliente";
      await refetchQueue()?.catch(() => {});
      return false;
    } finally {
      busyOrderId.value = "";
    }
  }

  /** Donde va el pedido: mesa o para llevar si lo tomo el personal; hora de recogida si es web. */
  function serviceLabel(order: any) {
    if (order.serviceType === "MESA") return order.table === BAR_TABLE ? "Barra" : `Mesa ${order.table}`;
    if (order.serviceType === "LLEVAR") return "Para llevar";
    return `Recogida: ${formatTime(order.pickupSlot)}`;
  }

  function statusLabel(status: string) {
    return STATUS_LABELS[status] ?? status;
  }
  const { formatTime, formatDateTime } = useStoreTime();

  return {
    orders,
    groupedQueue,
    historyOrders,
    historyLoading,
    loadHistory,
    advance,
    cancelOrder,
    assignCustomer,
    busyOrderId,
    actionError,
    nextStatus,
    nextStatusLabel,
    statusLabel,
    serviceLabel,
    formatTime,
    formatDateTime,
    notificationPermission,
    requestNotificationPermission,
  };
}
