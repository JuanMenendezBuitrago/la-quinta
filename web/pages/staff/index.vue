<template>
  <main class="container page-staff">
    <template v-if="!staff">
      <header class="account-hero">
        <h1>Panel de personal</h1>
      </header>
      <div class="card login-card">
        <input v-model="email" type="email" placeholder="Email del equipo" />
        <input v-model="password" type="password" placeholder="Contraseña" style="margin-top: 8px" />
        <button class="button" style="margin-top: 8px" :disabled="loggingIn" @click="doLogin">
          {{ loggingIn ? "Entrando…" : "Entrar" }}
        </button>
        <p v-if="loginError" class="muted" style="color: var(--danger)">{{ loginError }}</p>
      </div>
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
            class="button secondary"
            type="button"
            @click="requestNotificationPermission"
          >
            Activar notificaciones
          </button>
          <span v-else-if="notificationPermission === 'granted'" class="muted notif-status">
            🔔 Notificaciones activadas
          </span>
          <span v-else-if="notificationPermission === 'denied'" class="muted notif-status">
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
        <div v-for="group in groupedQueue" :key="group.status" class="queue-column">
          <h2>{{ statusLabel(group.status) }} ({{ group.orders.length }})</h2>
          <div v-if="!group.orders.length" class="order-card order-card--empty" :class="`status-${group.status}`">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
            <span>Nada aquí ahora mismo.</span>
          </div>
          <div
            v-for="order in group.orders"
            :key="order.id"
            class="order-card"
            :class="[`status-${order.status}`, { 'order-card--new': order._isNew }]"
          >
            <div class="order-info">
              <span class="order-code">{{ order.code }}</span>
              <template v-if="order.customer">
                <strong>{{ order.customer.name }}</strong> · {{ order.customer.customerCode }}
              </template>
              <strong v-else class="muted">Sin cliente</strong>
              <OrderItems :items="order.items" />
              <p class="service">{{ serviceLabel(order) }}</p>
              <p v-if="order.note" class="muted">Nota: {{ order.note }}</p>
              <p v-if="order.paidAt" class="paid-badge">Cobrado · {{ paymentLabel(order.paymentMethod) }}</p>
            </div>

            <div v-if="assigningId === order.id" class="assign-box">
              <CustomerLookup @found="doAssign(order, $event)" />
              <button class="button secondary" type="button" @click="assigningId = ''">No asignar</button>
            </div>

            <div v-if="pendingCancelId === order.id" class="order-actions">
              <span class="muted">¿Cancelar?</span>
              <button class="button secondary" type="button" :disabled="busyOrderId === order.id" @click="doCancel(order)">Sí</button>
              <button class="button secondary" type="button" @click="pendingCancelId = ''">No</button>
            </div>
            <!-- Cobro (mesa y barra): un toque en el metodo de pago -->
            <div v-else-if="payingId === order.id" class="pay-box">
              <span class="muted">Cobrar {{ formatPrice(order.totalCents) }} con:</span>
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
                Cobrar
              </button>
              <button
                v-if="nextStatus(order.status)"
                class="button"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="advance(order)"
              >
                {{ nextStatusLabel(order) }}
              </button>
              <button
                class="button secondary"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="pendingCancelId = order.id"
              >
                Cancelar
              </button>
              <button
                v-if="!order.customer && assigningId !== order.id"
                class="button secondary"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="assigningId = order.id"
              >
                Asignar cliente
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
            <template v-if="order.customer">
              <strong>{{ order.customer.name }}</strong> · {{ order.customer.customerCode }}
            </template>
            <strong v-else class="muted">Sin cliente</strong>
            <OrderItems :items="order.items" />
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

      <!-- Personal (solo gestion) -->
      <section v-else-if="activeTab === 'personal'">
        <StaffAdmin />
      </section>

      <!-- Configuracion: pedidos de clientes y pie de pagina (solo gestion) -->
      <section v-else-if="activeTab === 'pie'">
        <SiteSettingsAdmin />
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { useStaffAuth } from "~/composables/useAuth";
import { PAYMENT_LABELS, useStaffOrders, type CustomerMatch, type PaymentMethod } from "~/composables/useStaffOrders";
import { primeAudio } from "~/composables/useOrderChime";
import MenuAdmin from "~/components/MenuAdmin.vue";
import CoffeeAdmin from "~/components/CoffeeAdmin.vue";
import StaffAdmin from "~/components/StaffAdmin.vue";
import SiteSettingsAdmin from "~/components/SiteSettingsAdmin.vue";
import CustomersAdmin from "~/components/CustomersAdmin.vue";
import StaffOrderTaker from "~/components/StaffOrderTaker.vue";
import HeroAdmin from "~/components/HeroAdmin.vue";
import CustomerLookup from "~/components/CustomerLookup.vue";
import OrderItems from "~/components/OrderItems.vue";
import InventoryAdmin from "~/components/InventoryAdmin.vue";
import { formatQty, useInventoryAlerts } from "~/composables/useInventory";
import { goToSection, STAFF_SECTIONS, useStaffBadges, useStaffSection } from "~/composables/useStaffSections";

const { staff, login } = useStaffAuth();
const email = ref("");
const password = ref("");
const loggingIn = ref(false);
const loginError = ref("");

async function doLogin() {
  // Sincrono y antes del primer `await`: es el gesto de usuario que desbloquea el audio.
  primeAudio();
  loggingIn.value = true;
  loginError.value = "";
  try {
    await login(email.value, password.value);
  } catch (err: any) {
    loginError.value = err?.message ?? "No se pudo iniciar sesión";
  } finally {
    loggingIn.value = false;
  }
}

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
} = useStaffOrders(isLoggedIn);

const { lowCount, lastAlert: stockAlert } = useInventoryAlerts(isLoggedIn);
// En la propia pestaña de inventario el aviso sobra (ya se ve en rojo): no se guarda para despues.
watch(stockAlert, (alert) => {
  if (alert && activeTab.value === "inventario") stockAlert.value = null;
});

const pendingCancelId = ref("");
const payingId = ref("");
async function doPay(order: any, method: PaymentMethod) {
  if (await markPaid(order, method)) payingId.value = "";
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
  };
});
</script>

<style scoped>
.page-staff { padding-bottom: 60px; }

.account-hero { margin-bottom: 22px; }
.staff-hero { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 0; }
.staff-who { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.notif-status { font-size: 12.5px; white-space: nowrap; }

.login-card { max-width: 320px; }

.service { margin: 4px 0 0; font-weight: 600; color: var(--accent-strong); }
.assign-box { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }

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
  .queue-board { grid-template-columns: repeat(4, minmax(0, 1fr)); }
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

.order-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.order-actions .button { min-height: 44px; padding-left: 16px; padding-right: 16px; }

.history-list { display: flex; flex-direction: column; gap: 10px; }
.history-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }

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
