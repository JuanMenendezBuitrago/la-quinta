<template>
  <main class="container page-staff">
    <template v-if="!staff">
      <header class="account-hero login-hero">
        <h1>Panel de personal</h1>
      </header>
      <StaffLogin />
    </template>

    <template v-else>
      <header class="account-hero staff-hero">
        <div>
          <p class="eyebrow">Panel de personal</p>
          <h1>{{ sectionLabel }}</h1>
        </div>
        <div v-if="activeTab === 'cola'" class="staff-who">
          <button
            v-if="notificationPermission === 'default'"
            class="button secondary notif-button"
            type="button"
            @click="requestNotificationPermission"
          >
            <Bell :size="16" :stroke-width="1.8" />
            Activar notificaciones
          </button>
          <!-- Con permiso: la pastilla es un interruptor (silencia los avisos en este dispositivo) -->
          <button
            v-else-if="notificationPermission === 'granted'"
            type="button"
            class="notif-status notif-toggle"
            :class="{ 'notif-status--muted': notificationsMuted }"
            :aria-pressed="!notificationsMuted"
            :title="notificationsMuted ? 'Pulsa para volver a activarlas' : 'Pulsa para desactivarlas en este dispositivo'"
            @click="toggleNotificationsMuted"
          >
            <BellOff v-if="notificationsMuted" :size="14" :stroke-width="1.8" />
            <BellRing v-else :size="14" :stroke-width="1.8" />
            {{ notificationsMuted ? "Notificaciones desactivadas" : "Notificaciones activadas" }}
          </button>
          <span
            v-else-if="notificationPermission === 'denied'"
            class="notif-status notif-status--off"
            title="Se pueden permitir de nuevo desde los ajustes del sitio en el navegador"
          >
            <BellOff :size="14" :stroke-width="1.8" />
            Notificaciones bloqueadas por el navegador
          </span>
        </div>
      </header>

      <p v-if="stockAlert && activeTab !== 'inventario'" class="stock-alert" role="alert">
        <span>
          Queda poco <strong>{{ stockAlert.name }}</strong>: {{ formatQty(stockAlert.stock, stockAlert.unit) }}
          (mínimo {{ formatQty(stockAlert.minStock, stockAlert.unit) }}).
        </span>
        <span class="stock-alert-actions">
          <button class="button secondary" type="button" @click="selectTab('inventario')">Ver inventario</button>
          <button class="button secondary" type="button" @click="stockAlert = null">Cerrar</button>
        </span>
      </p>

      <!-- Cola -->
      <p v-if="activeTab === 'cola' && actionError" class="action-error" role="alert">
        {{ actionError }}
        <button class="button secondary" type="button" @click="actionError = ''">Cerrar</button>
      </p>
      <section v-if="activeTab === 'cola'" class="queue-board">
        <div v-for="group in groupedQueue" :id="`cola-${group.status}`" :key="group.status" class="queue-column">
          <h2>{{ queueHeading(group.status, group.orders.length) }}</h2>
          <div v-if="!group.orders.length" class="order-card order-card--empty" :class="`status-${group.status}`">
            <Inbox :size="22" :stroke-width="1.6" />
            <span>Nada aquí ahora mismo.</span>
          </div>
          <div
            v-for="order in group.orders"
            :key="order.id"
            class="order-card"
            :class="[`status-${order.status}`, { 'order-card--new': order._isNew }]"
          >
            <div class="order-info">
              <div class="order-head">
                <!-- Volver al estado anterior: chevron en la esquina, lejos de los botones de avanzar -->
                <button
                  v-if="prevStatusLabel(order)"
                  class="back-chevron"
                  type="button"
                  :aria-label="`${prevStatusLabel(order)}: ${order.code}`"
                  :title="prevStatusLabel(order)"
                  :disabled="busyOrderId === order.id"
                  @click="goBack(order)"
                >
                  <ChevronLeft :size="18" :stroke-width="2" aria-hidden="true" />
                </button>
                <span class="order-code">{{ order.code }}</span>
                <!-- A la derecha: mesa u hora de recogida, y quien lo movio por ultima vez (el NUEVO
                     de un pedido web no tiene a nadie) -->
                <span class="order-head-right">
                  <span class="service">{{ serviceLabel(order) }}</span>
                  <span
                    v-if="handledBy(order)"
                    class="handled-by"
                    :title="`Gestionado por ${handledBy(order)!.staffName}`"
                  >
                    <UserAvatar :avatar="handledBy(order)!.staffAvatar" :name="handledBy(order)!.staffName" :size="22" />
                    <span class="sr-only">Gestionado por {{ handledBy(order)!.staffName }}</span>
                  </span>
                </span>
              </div>
              <span v-if="order.customer" class="order-customer">
                <UserAvatar :avatar="order.customer.avatar" :name="order.customer.name" :size="24" />
                <strong>{{ order.customer.name }}</strong>
              </span>
              <span v-else class="order-customer">
                <strong class="muted">Sin cliente</strong>
                <button
                  v-if="assigningId !== order.id"
                  class="assign-icon"
                  type="button"
                  :aria-label="`Asignar cliente al pedido ${order.code}`"
                  title="Asignar cliente"
                  :disabled="busyOrderId === order.id"
                  @click="assigningId = order.id"
                >
                  <UserPlus :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </span>
              <OrderItems :items="order.items" list />
              <p v-if="order.note" class="muted">Nota: {{ order.note }}</p>
              <p v-if="order.paidAt" class="paid-badge">Cobrado · {{ paymentLabel(order.paymentMethod) }}</p>
            </div>

            <div v-if="assigningId === order.id" class="assign-box">
              <p class="assign-title">
                <UserPlus :size="15" :stroke-width="1.8" aria-hidden="true" />
                Asignar cliente
              </p>
              <CustomerLookup icon-only @found="doAssign(order, $event)" />
              <button class="button secondary" type="button" @click="assigningId = ''">No asignar</button>
            </div>

            <!-- Confirmacion de cancelacion: "No" queda donde estaba la accion principal, para que un
                 doble toque no cancele; el "Si" va despues y en rojo. -->
            <div v-if="pendingCancelId === order.id" class="cancel-confirm" role="alert">
              <p>
                <strong>¿Cancelar el pedido <span class="nowrap">{{ order.code }}</span>?</strong>
                {{ order.awaitingPayment ? "Ya está servido y sin cobrar: quedará como no pagado." : "" }}
                No se puede deshacer.
              </p>
              <div class="order-actions">
                <button class="button secondary" type="button" :disabled="busyOrderId === order.id" @click="pendingCancelId = ''">
                  No, mantener
                </button>
                <button class="button danger-solid" type="button" :disabled="busyOrderId === order.id" @click="doCancel(order)">
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                  {{ busyOrderId === order.id ? "Cancelando…" : "Sí, cancelar" }}
                </button>
              </div>
            </div>
            <!-- Cobro (mesa y barra): un toque en el metodo de pago -->
            <div v-else-if="payingId === order.id" class="pay-box">
              <span class="muted">{{ order.awaitingPayment ? "Cobrar" : "Entregar y cobrar" }} {{ formatPrice(order.totalCents) }} con:</span>
              <div class="pay-methods">
                <button
                  v-for="(label, method) in PAYMENT_LABELS"
                  :key="method"
                  class="button"
                  type="button"
                  :disabled="busyOrderId === order.id"
                  @click="doPay(order, method)"
                >
                  {{ label }}
                </button>
              </div>
              <button class="button secondary" type="button" @click="payingId = ''">Volver</button>
            </div>
            <div v-else class="order-actions">
              <button
                v-if="order.awaitingPayment"
                :class="group.status === 'POR_COBRAR' ? 'button' : 'button secondary'"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="payingId = order.id"
              >
                <Banknote :size="16" :stroke-width="1.8" aria-hidden="true" />
                Cobrar
              </button>
              <button
                v-if="nextStatus(order.status)"
                class="button"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="paysOnDelivery(order) ? (payingId = order.id) : advance(order)"
              >
                <!-- Check en los pasos que terminan algo: listo, y entregado (y pagado) -->
                <Check v-if="order.status === 'EN_PREPARACION' || order.status === 'LISTO'" :size="16" :stroke-width="2" aria-hidden="true" />
                {{ nextStatusLabel(order) }}
              </button>
              <button
                class="button secondary cancel"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="pendingCancelId = order.id"
              >
                <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Tomar pedido (mesero / barra) -->
      <section v-else-if="activeTab === 'tomar'">
        <StaffOrderTaker />
      </section>

      <!-- Historial -->
      <section v-else-if="activeTab === 'historial'" class="history-list">
        <p v-if="historyLoading" class="muted">Cargando historial…</p>
        <p v-else-if="!historyOrders.length" class="muted">Todavía no hay pedidos entregados ni cancelados.</p>
        <div v-for="order in historyOrders" :key="order.id" class="card history-row">
          <div class="order-info">
            <span class="order-code">{{ order.code }}</span>
            <span v-if="order.customer" class="order-customer">
              <UserAvatar :avatar="order.customer.avatar" :name="order.customer.name" :size="24" />
              <strong>{{ order.customer.name }}</strong>
            </span>
            <strong v-else class="muted">Sin cliente</strong>
            <OrderItems :items="order.items" list />
            <p class="muted">
              {{ order.serviceType ? `${serviceLabel(order)} · ` : "" }}{{ formatDateTime(order.updatedAt) }}{{
                order.paidAt ? ` · Cobrado con ${paymentLabel(order.paymentMethod)}` : ""
              }}
            </p>
          </div>
          <span class="status-badge" :class="`status-${order.status}`">{{ statusLabel(order.status) }}</span>
        </div>
      </section>

      <!-- Inventario (barra registra; gestion ademas administra) -->
      <section v-else-if="activeTab === 'inventario'">
        <InventoryAdmin />
      </section>

      <!-- Carta (solo gestion) -->
      <section v-else-if="activeTab === 'carta'">
        <MenuAdmin />
      </section>

      <!-- Cafe en grano en bolsas (solo gestion) -->
      <section v-else-if="activeTab === 'cafe'">
        <CoffeeAdmin />
      </section>

      <!-- Clientes (solo gestion) -->
      <section v-else-if="activeTab === 'clientes'">
        <CustomersAdmin />
      </section>

      <!-- Portada de la carta (solo gestion) -->
      <section v-else-if="activeTab === 'portada'">
        <HeroAdmin />
      </section>

      <!-- Novedades por email (solo gestion) -->
      <section v-else-if="activeTab === 'novedades'">
        <NewsletterAdmin />
      </section>

      <!-- Personal (solo gestion) -->
      <section v-else-if="activeTab === 'personal'">
        <StaffAdmin />
      </section>

      <!-- Opiniones de los clientes (solo gestion) -->
      <section v-else-if="activeTab === 'opiniones'">
        <ReviewsAdmin />
      </section>

      <!-- Cierre de caja (barra y gestion) -->
      <section v-else-if="activeTab === 'caja'">
        <CashClosingAdmin />
      </section>

      <!-- Configuracion: pedidos de clientes y pie de pagina (solo gestion) -->
      <section v-else-if="activeTab === 'pie'">
        <SiteSettingsAdmin />
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { Banknote, Bell, BellOff, BellRing, Check, ChevronLeft, Inbox, Trash2, UserPlus } from "lucide-vue-next";
import { useStaffAuth } from "~/composables/useAuth";
import { PAYMENT_LABELS, useStaffOrders, type CustomerMatch, type PaymentMethod } from "~/composables/useStaffOrders";
import { primeAudio } from "~/composables/useOrderChime";
import MenuAdmin from "~/components/MenuAdmin.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import StaffLogin from "~/components/StaffLogin.vue";
import CashClosingAdmin from "~/components/CashClosingAdmin.vue";
import ReviewsAdmin from "~/components/ReviewsAdmin.vue";
import CoffeeAdmin from "~/components/CoffeeAdmin.vue";
import StaffAdmin from "~/components/StaffAdmin.vue";
import NewsletterAdmin from "~/components/NewsletterAdmin.vue";
import SiteSettingsAdmin from "~/components/SiteSettingsAdmin.vue";
import CustomersAdmin from "~/components/CustomersAdmin.vue";
import StaffOrderTaker from "~/components/StaffOrderTaker.vue";
import HeroAdmin from "~/components/HeroAdmin.vue";
import CustomerLookup from "~/components/CustomerLookup.vue";
import OrderItems from "~/components/OrderItems.vue";
import InventoryAdmin from "~/components/InventoryAdmin.vue";
import { formatQty, useInventoryAlerts } from "~/composables/useInventory";
import { goToSection, STAFF_SECTIONS, useStaffBadges, useStaffSection } from "~/composables/useStaffSections";

const { staff } = useStaffAuth();
// Si la sesion ya estaba abierta (se restaura sola con la cookie, sin pasar por doLogin()),
// el audio nunca se desbloquea y el aviso sonoro queda mudo en silencio. Con esto, el primer
// toque/clic en cualquier parte del panel sirve tambien para desbloquearlo.
if (import.meta.client) {
  const primeOnce = () => {
    primeAudio();
    window.removeEventListener("pointerdown", primeOnce);
    window.removeEventListener("keydown", primeOnce);
  };
  onMounted(() => {
    window.addEventListener("pointerdown", primeOnce);
    window.addEventListener("keydown", primeOnce);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("pointerdown", primeOnce);
    window.removeEventListener("keydown", primeOnce);
  });
}

const isLoggedIn = computed(() => !!staff.value);
const {
  groupedQueue,
  historyOrders,
  historyLoading,
  loadHistory,
  advance,
  goBack,
  paysOnDelivery,
  deliverAndPay,
  prevStatusLabel,
  cancelOrder,
  assignCustomer,
  markPaid,
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
  notificationsMuted,
  toggleNotificationsMuted,
} = useStaffOrders(isLoggedIn);

const { lowCount, lastAlert: stockAlert } = useInventoryAlerts(isLoggedIn);

// Encabezado de cada columna en lenguaje natural: "1 nuevo", "3 listos", "2 en preparación".
const QUEUE_HEADINGS: Record<string, [singular: string, plural: string]> = {
  NUEVO: ["nuevo", "nuevos"],
  EN_PREPARACION: ["en preparación", "en preparación"],
  LISTO: ["listo", "listos"],
  POR_COBRAR: ["por cobrar", "por cobrar"],
};
function queueHeading(status: string, count: number) {
  const words = QUEUE_HEADINGS[status];
  if (!words) return `${statusLabel(status)} (${count})`;
  return `${count} ${count === 1 ? words[0] : words[1]}`;
}

/** Ultimo miembro del personal que cambio el estado del pedido (o lo tomo), si lo hay. */
function handledBy(order: any): { staffName: string; staffAvatar?: string | null } | null {
  const history: any[] = order.statusHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) if (history[i].staffName) return history[i];
  return null;
}
// En la propia pestaña de inventario el aviso sobra (ya se ve en rojo): no se guarda para despues.
watch(stockAlert, (alert) => {
  if (alert && activeTab.value === "inventario") stockAlert.value = null;
});

const pendingCancelId = ref("");
const payingId = ref("");
async function doPay(order: any, method: PaymentMethod) {
  // Mesa: se cobra aparte. Para llevar o web: se entrega y se cobra a la vez (cuenta en el cierre de caja).
  const done = order.awaitingPayment ? await markPaid(order, method) : await deliverAndPay(order, method);
  if (done) payingId.value = "";
}
function paymentLabel(method: PaymentMethod | null) {
  return method ? PAYMENT_LABELS[method] : "";
}
function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
const assigningId = ref("");
async function doAssign(order: any, customer: CustomerMatch) {
  if (await assignCustomer(order, customer)) assigningId.value = "";
}
async function doCancel(order: any) {
  await cancelOrder(order);
  pendingCancelId.value = "";
}

// Secciones y grupos del menu: composables/useStaffSections.ts. El menu (components/StaffNav.vue,
// en la barra superior) cambia la seccion en la URL; aqui solo se lee.
const activeTab = useStaffSection();
const sectionLabel = computed(() => STAFF_SECTIONS.find((s) => s.id === activeTab.value)?.label ?? "");
const selectTab = goToSection;

watch(
  [activeTab, isLoggedIn],
  ([id, loggedIn]) => {
    if (id === "inventario") stockAlert.value = null;
    if (id === "historial" && loggedIn) loadHistory();
  },
  { immediate: true }
);

// Contadores del menu: pedidos en cola e insumos bajo minimo.
const badges = useStaffBadges();
watchEffect(() => {
  badges.value = {
    cola: groupedQueue.value.reduce((sum: number, g: { orders: unknown[] }) => sum + g.orders.length, 0),
    inventario: lowCount.value,
    porCobrar: groupedQueue.value.find((g: { status: string }) => g.status === "POR_COBRAR")?.orders.length ?? 0,
  };
});
</script>

<style scoped>
.page-staff { padding-bottom: 60px; }
/* Al saltar a una columna desde la barra de acceso rapido, que no quede bajo la barra superior */
.queue-column { scroll-margin-top: 80px; }

.account-hero { margin-bottom: 22px; }
.staff-hero { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 0; }
.staff-who { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
/* Estado de las notificaciones: pastilla con icono, turquesa si estan activas y roja si no. */
.notif-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent-strong);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.notif-status--off {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.notif-button { display: inline-flex; align-items: center; gap: 8px; }
.order-customer { display: flex; align-items: center; gap: 8px; }
.login-hero { text-align: center; }
.order-head { display: flex; align-items: center; gap: 8px; }
/* Aire entre encabezado, cliente y productos de cada tarjeta de la cola */
.order-card .order-head { margin-bottom: 12px; }
.order-card .order-customer { margin-bottom: 4px; }
/* Productos del pedido en la cola: mas grandes que el texto secundario (14px), se leen de lejos */
.order-card .order-items { margin: 10px 0 12px; font-size: 16px; line-height: 1.4; }
.order-head-right { margin-left: auto; display: flex; align-items: center; gap: 6px; min-width: 0; }
.handled-by { display: inline-flex; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.notif-toggle { font-family: inherit; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.notif-toggle:hover { background: color-mix(in srgb, var(--accent) 30%, transparent); }
.notif-status--muted {
  border-color: var(--field-border);
  background: transparent;
  color: var(--text-muted);
}
.notif-status--muted:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }

.service { font-size: 13px; font-weight: 600; color: var(--accent-strong); text-align: right; }
/* Elegir cliente: recuadro teñido de turquesa (como la confirmacion de cancelar, en rojo) */
.assign-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.assign-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-strong);
}

.action-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--danger);
  border-radius: 8px;
  color: var(--danger);
}

.order-code {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.stock-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 12px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--danger);
  border-radius: 8px;
}
.stock-alert-actions { display: flex; gap: 8px; }

.queue-board { display: flex; flex-direction: column; gap: 28px; }
/* 4 columnas no caben en los 720 px del panel: en escritorio el tablero usa mas ancho que la pagina */
@media (min-width: 900px) {
  .queue-board {
    width: min(1160px, calc(100vw - 40px));
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }
}
@media (min-width: 640px) {
  .queue-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
}
@media (min-width: 900px) {
  /* En columnas: linea suave entre ellas, a toda la altura del tablero (stretch). */
  .queue-board { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; align-items: stretch; }
  .queue-column { padding: 0 12px; }
  .queue-column:first-child { padding-left: 0; }
  .queue-column:last-child { padding-right: 0; }
  .queue-column + .queue-column { border-left: 1px solid color-mix(in srgb, var(--text) 15%, transparent); }
}

.order-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--border-strong);
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.order-card.status-NUEVO { border-left-color: var(--color4); }
.order-card.status-EN_PREPARACION { border-left-color: var(--color5); }
.order-card.status-LISTO { border-left-color: var(--accent-strong); }
.order-card.status-ENTREGADO { border-left-color: var(--danger); }
.paid-badge {
  display: inline-block;
  margin: 6px 0 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-strong);
  color: var(--bg);
  font-size: 12px;
  font-weight: 700;
}
.pay-box { display: flex; flex-direction: column; gap: 8px; }
.pay-methods { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.pay-methods .button { min-height: 44px; }

@keyframes order-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(154, 210, 208, 0); }
  30% { box-shadow: 0 0 0 6px rgba(154, 210, 208, 0.45); }
}
/* Columna vacia: una tarjeta apagada en lugar de un texto suelto. */
.order-card--empty {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  opacity: 0.5;
  color: var(--text-muted);
  font-size: 14px;
}
.order-card--new { animation: order-pulse 0.9s ease-out 2; }

/* Un boton por fila y a todo el ancho de la tarjeta: blancos grandes para tocar con prisa */
.order-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.order-actions .button { width: 100%; min-height: 44px; padding-left: 16px; padding-right: 16px; }
.cancel-confirm {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}
.cancel-confirm p { margin: 0 0 10px; font-size: 14px; }
.nowrap { white-space: nowrap; }
.back-chevron {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin: -6px 0 -6px -8px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: none;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.back-chevron:hover:not(:disabled) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.back-chevron:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.back-chevron:disabled { opacity: 0.45; cursor: not-allowed; }
.assign-icon {
  width: 30px;
  height: 30px;
  border: 1px solid var(--field-border);
  border-radius: 50%;
  background: none;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.assign-icon:hover:not(:disabled) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.assign-icon:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.assign-icon:disabled { opacity: 0.45; cursor: not-allowed; }
.danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; }

.history-list { display: flex; flex-direction: column; gap: 10px; }
/* Estado (entregado/cancelado) en la esquina superior derecha, alineado con el codigo */
.history-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }

.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--bg);
}
.status-badge.status-ENTREGADO { background: var(--accent-strong); }
.status-badge.status-CANCELADO { background: var(--danger); }
</style>
