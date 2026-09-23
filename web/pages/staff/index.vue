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
          <h1>Panel de personal</h1>
        </div>
        <div class="staff-who">
          <span class="muted">{{ staff.name }} · {{ staff.role }}</span>
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
          <button class="button secondary" type="button" @click="logout">Salir</button>
        </div>
      </header>

      <nav class="tabs" aria-label="Secciones">
        <button
          v-for="tab in visibleTabs"
          :key="tab.id"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Cola -->
      <p v-if="activeTab === 'cola' && actionError" class="action-error" role="alert">
        {{ actionError }}
        <button class="button secondary" type="button" @click="actionError = ''">Cerrar</button>
      </p>
      <section v-if="activeTab === 'cola'" class="queue-board">
        <div v-for="group in groupedQueue" :key="group.status" class="queue-column">
          <h2>{{ statusLabel(group.status) }} ({{ group.orders.length }})</h2>
          <p v-if="!group.orders.length" class="muted">Nada aquí ahora mismo.</p>
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
              <p class="muted">{{ order.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ") }}</p>
              <p class="service">{{ serviceLabel(order) }}</p>
              <p v-if="order.note" class="muted">Nota: {{ order.note }}</p>
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
            <div v-else class="order-actions">
              <button
                v-if="nextStatus(order.status)"
                class="button"
                type="button"
                :disabled="busyOrderId === order.id"
                @click="advance(order)"
              >
                {{ nextStatusLabel(order.status) }}
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
            <p class="muted">{{ order.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ") }}</p>
            <p class="muted">{{ order.serviceType ? `${serviceLabel(order)} · ` : "" }}{{ formatDateTime(order.updatedAt) }}</p>
          </div>
          <span class="status-badge" :class="`status-${order.status}`">{{ statusLabel(order.status) }}</span>
        </div>
      </section>

      <!-- Carta (solo gestion) -->
      <section v-else-if="activeTab === 'carta'">
        <MenuAdmin />
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

      <!-- Pie de pagina (solo gestion) -->
      <section v-else-if="activeTab === 'pie'">
        <SiteSettingsAdmin />
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { useStaffAuth } from "~/composables/useAuth";
import { useStaffOrders, type CustomerMatch } from "~/composables/useStaffOrders";
import { primeAudio } from "~/composables/useOrderChime";
import MenuAdmin from "~/components/MenuAdmin.vue";
import StaffAdmin from "~/components/StaffAdmin.vue";
import SiteSettingsAdmin from "~/components/SiteSettingsAdmin.vue";
import CustomersAdmin from "~/components/CustomersAdmin.vue";
import StaffOrderTaker from "~/components/StaffOrderTaker.vue";
import HeroAdmin from "~/components/HeroAdmin.vue";
import CustomerLookup from "~/components/CustomerLookup.vue";

const { staff, login, logout } = useStaffAuth();
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

const pendingCancelId = ref("");
const assigningId = ref("");
async function doAssign(order: any, customer: CustomerMatch) {
  if (await assignCustomer(order, customer)) assigningId.value = "";
}
async function doCancel(order: any) {
  await cancelOrder(order);
  pendingCancelId.value = "";
}

const ALL_TABS = [
  { id: "cola", label: "Cola", roles: ["barra", "gestion"] },
  { id: "tomar", label: "Tomar pedido", roles: ["barra", "gestion"] },
  { id: "historial", label: "Historial", roles: ["barra", "gestion"] },
  // Solo gestion: muestra datos personales (la politica de privacidad limita el acceso a quien lo necesita).
  { id: "clientes", label: "Clientes", roles: ["gestion"] },
  { id: "carta", label: "Carta", roles: ["gestion"] },
  { id: "portada", label: "Portada", roles: ["gestion"] },
  { id: "personal", label: "Personal", roles: ["gestion"] },
  { id: "pie", label: "Pie de página", roles: ["gestion"] },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];
const activeTab = ref<TabId>("cola");
const visibleTabs = computed(() => ALL_TABS.filter((t) => t.roles.includes(staff.value?.role)));

function selectTab(id: TabId) {
  activeTab.value = id;
  if (id === "historial") loadHistory();
}
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

.tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 22px; border-bottom: 1px solid var(--border-strong); }
.tab-btn {
  flex-shrink: 0;
  /* el borde inferior se superpone al de .tabs para que la linea quede continua */
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 10px 14px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.tab-btn:hover { color: var(--text); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

.queue-board { display: flex; flex-direction: column; gap: 28px; }
@media (min-width: 640px) {
  .queue-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: start; }
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

@keyframes order-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(154, 210, 208, 0); }
  30% { box-shadow: 0 0 0 6px rgba(154, 210, 208, 0.45); }
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
