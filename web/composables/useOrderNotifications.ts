// Aviso complementario al sonido (ver useOrderChime.ts): una notificacion del sistema para
// cuando el personal esta mirando otra pestaña o otra app. A diferencia del audio, una vez
// concedido el permiso no hace falta ningun gesto nuevo para que vuelva a sonar/aparecer en
// cargas posteriores de la pagina.
export function useOrderNotifications() {
  const supported = import.meta.client && typeof window !== "undefined" && "Notification" in window;

  // Se expone como estado reactivo para que el boton del panel refleje "concedido / denegado /
  // sin pedir" sin tener que recargar la pagina. Empieza como en el servidor (que no tiene
  // Notification) y se lee al montar: si no, el boton del panel no coincide al hidratar.
  const permission = ref<NotificationPermission | "unsupported">("unsupported");

  // El permiso del navegador no se puede retirar desde la pagina: para "desactivarlas" se
  // silencian aqui, por dispositivo (localStorage), sin tocar el permiso.
  const MUTED_KEY = "lq-order-notifications-muted";
  const muted = ref(false);
  if (supported) {
    onMounted(() => {
      permission.value = Notification.permission;
      try {
        muted.value = localStorage.getItem(MUTED_KEY) === "1";
      } catch {
        // almacenamiento bloqueado (modo privado, etc.): quedan activas
      }
    });
  }
  function toggleMuted() {
    muted.value = !muted.value;
    try {
      if (muted.value) localStorage.setItem(MUTED_KEY, "1");
      else localStorage.removeItem(MUTED_KEY);
    } catch {
      // sin almacenamiento se aplica igual, solo hasta recargar
    }
  }

  /** Debe llamarse desde un clic real del usuario (los navegadores no la conceden si no). */
  async function requestPermission() {
    if (!supported) return;
    try {
      permission.value = await Notification.requestPermission();
    } catch {
      // navegadores muy antiguos usan un callback en vez de promesa; se ignora si falla
    }
  }

  /** Nunca lanza: un fallo aqui no debe impedir el resto de avisos (sonido, pulso). */
  function showNewOrderNotification(order: { customer?: { name?: string }; items?: { name: string; quantity: number }[] }) {
    if (!supported || permission.value !== "granted" || muted.value) return;
    try {
      const items = order.items?.map((i) => `${i.quantity}× ${i.name}`).join(", ") ?? "";
      const notification = new Notification("Nuevo pedido — La Quinta", {
        body: [order.customer?.name, items].filter(Boolean).join("\n"),
        tag: "la-quinta-nuevo-pedido", // agrupa varias notificaciones seguidas en una sola
        renotify: true,
        // renotify lo soportan los navegadores, pero aun no esta en los tipos de TypeScript.
      } as NotificationOptions);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // el sonido y el pulso visual siguen funcionando aunque esto falle
    }
  }

  return { supported, permission, requestPermission, muted, toggleMuted, showNewOrderNotification };
}
