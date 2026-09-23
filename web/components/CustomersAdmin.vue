<template>
  <section class="customers-admin">
    <!-- Ficha de un cliente -->
    <template v-if="selectedId">
      <button class="button secondary back" type="button" @click="closeDetail">← Clientes</button>

      <p v-if="detailLoading && !detail" class="muted">Cargando cliente…</p>
      <p v-if="detailError" class="muted" style="color: var(--danger)">{{ detailError }}</p>

      <template v-if="detail">
        <header class="detail-header">
          <h2>{{ detail.customer.name }}</h2>
          <p class="muted">
            <span class="code">{{ detail.customer.customerCode }}</span>
            · {{ detail.customer.email || detail.customer.phone }}
            · cliente desde {{ formatDate(detail.customer.createdAt) }}
          </p>
        </header>

        <div class="stats">
          <div class="card stat"><span class="stat-value">{{ detail.customer.ordersCount }}</span><span class="muted">pedidos</span></div>
          <div class="card stat"><span class="stat-value">{{ detail.customer.deliveredCount }}</span><span class="muted">entregados</span></div>
          <div class="card stat"><span class="stat-value">{{ detail.customer.cancelledCount }}</span><span class="muted">cancelados</span></div>
          <div class="card stat"><span class="stat-value">{{ formatPrice(detail.customer.spentCents) }}</span><span class="muted">gastado</span></div>
        </div>

        <section class="card stamps-card">
          <div class="stamps-head">
            <div>
              <p class="eyebrow">Sellos</p>
              <p class="stamps-balance">{{ detail.customer.stampsBalance }} de {{ detail.rewardThreshold }}</p>
            </div>
            <button
              v-if="detail.customer.rewardAvailable"
              class="button"
              type="button"
              :disabled="stampsBusy"
              @click="redeem"
            >
              Canjear recompensa
            </button>
          </div>

          <form class="adjust-form" @submit.prevent="adjust">
            <span class="muted">Ajustar sellos (p. ej. al pasar una tarjeta de cartón o corregir un error). En el motivo no pongas datos personales.</span>
            <div class="adjust-row">
              <input v-model.number="adjustStamps" type="number" step="1" min="-100" max="100" placeholder="± sellos" aria-label="Sellos a sumar o restar" required />
              <input v-model="adjustNote" type="text" maxlength="200" placeholder="Motivo" aria-label="Motivo" required />
              <button class="button secondary" type="submit" :disabled="stampsBusy || !adjustStamps || !adjustNote.trim()">
                Aplicar
              </button>
            </div>
          </form>
          <p v-if="stampsMessage" class="muted" :style="{ color: stampsError ? 'var(--danger)' : 'var(--accent-strong)' }">
            {{ stampsMessage }}
          </p>
        </section>

        <section class="detail-section">
          <h3>Pedidos</h3>
          <p v-if="!detail.orders.length" class="muted">Todavía no ha hecho ningún pedido.</p>
          <div v-for="order in detail.orders" :key="order.id" class="card row">
            <div class="row-info">
              <span class="code">{{ order.code }}</span>
              <p>{{ itemsSummary(order.items) }}</p>
              <p class="muted">{{ formatDateTime(order.createdAt) }} · {{ formatPrice(order.totalCents) }}</p>
            </div>
            <span class="status-badge" :class="`status-${order.status}`">{{ STATUS_LABELS[order.status] ?? order.status }}</span>
          </div>
        </section>

        <section class="detail-section">
          <h3>Historial de sellos</h3>
          <p v-if="!detail.stamps.length" class="muted">Sin movimientos.</p>
          <div v-for="m in detail.stamps" :key="m.id" class="card row">
            <div class="row-info">
              <strong>{{ REASON_LABELS[m.reason] ?? m.reason }}</strong>
              <span v-if="m.orderCode" class="muted"> · {{ m.orderCode }}</span>
              <p v-if="m.note || m.staffName" class="muted">
                {{ [m.note, m.staffName && `por ${m.staffName}`].filter(Boolean).join(" · ") }}
              </p>
              <p class="muted">{{ formatDateTime(m.createdAt) }}</p>
            </div>
            <span class="stamps-delta" :class="{ negative: m.stamps < 0 }">{{ m.stamps > 0 ? "+" : "" }}{{ m.stamps }}</span>
          </div>
        </section>
      </template>
    </template>

    <!-- Listado -->
    <template v-else>
      <div class="list-header">
        <h2>Clientes <span v-if="total !== null" class="muted">({{ total }})</span></h2>
      </div>
      <input
        v-model="search"
        class="search"
        type="search"
        placeholder="Buscar por nombre, email, teléfono o código"
        aria-label="Buscar clientes"
      />

      <p v-if="listLoading && !customers.length" class="muted">Cargando clientes…</p>
      <p v-if="listError" class="muted" style="color: var(--danger)">{{ listError }}</p>
      <p v-if="!listLoading && !listError && !customers.length" class="muted">
        {{ search.trim() ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes registrados." }}
      </p>

      <button v-for="c in customers" :key="c.id" type="button" class="card row customer-row" @click="openDetail(c.id)">
        <div class="row-info">
          <strong>{{ c.name }}</strong> <span class="code">{{ c.customerCode }}</span>
          <p class="muted">{{ c.email || c.phone }}</p>
          <p class="muted">
            {{ c.ordersCount }} {{ c.ordersCount === 1 ? "pedido" : "pedidos" }}
            · {{ formatPrice(c.spentCents) }}
            <template v-if="c.lastOrderAt"> · último {{ formatDate(c.lastOrderAt) }}</template>
          </p>
        </div>
        <div class="row-side">
          <span class="stamps-pill" :class="{ reward: c.rewardAvailable }">
            {{ c.stampsBalance }} {{ c.stampsBalance === 1 ? "sello" : "sellos" }}
          </span>
          <span v-if="c.rewardAvailable" class="muted reward-label">Recompensa</span>
        </div>
      </button>

      <button
        v-if="total !== null && customers.length < total"
        class="button secondary load-more"
        type="button"
        :disabled="listLoading"
        @click="loadMore"
      >
        {{ listLoading ? "Cargando…" : "Cargar más" }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";

interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customerCode: string;
  createdAt: string;
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  spentCents: number;
  lastOrderAt: string | null;
  stampsBalance: number;
  rewardAvailable: boolean;
}

const SUMMARY_FIELDS = `
  id name email phone customerCode createdAt
  ordersCount deliveredCount cancelledCount spentCents lastOrderAt
  stampsBalance rewardAvailable
`;
const CUSTOMERS_QUERY = gql`
  query Customers($search: String, $limit: Int, $offset: Int) {
    customers(search: $search, limit: $limit, offset: $offset) {
      total
      items { ${SUMMARY_FIELDS} }
    }
  }
`;
const DETAIL_QUERY = gql`
  query CustomerDetail($id: ID!) {
    customerDetail(id: $id) {
      rewardThreshold
      customer { ${SUMMARY_FIELDS} }
      orders { id code status totalCents createdAt items { name quantity } }
      stamps { id stamps reason note orderCode staffName createdAt }
    }
  }
`;
const REDEEM = gql`
  mutation RedeemCustomerReward($customerId: ID!) {
    redeemCustomerReward(customerId: $customerId) { balance }
  }
`;
const ADJUST = gql`
  mutation AdjustCustomerStamps($customerId: ID!, $stamps: Int!, $note: String!) {
    adjustCustomerStamps(customerId: $customerId, stamps: $stamps, note: $note) { balance }
  }
`;

const PAGE_SIZE = 25;
const STATUS_LABELS: Record<string, string> = {
  NUEVO: "Nuevo",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
const REASON_LABELS: Record<string, string> = { pedido: "Pedido", canje: "Canje", ajuste: "Ajuste" };

const { formatDateTime } = useStoreTime();
function formatDate(iso: string) {
  return formatDateTime(iso).replace(/,.*$/, "");
}
function itemsSummary(items: { name: string; quantity: number }[]) {
  return items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}
function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Las consultas van con defaultClient.query + network-only (como el historial de pedidos):
// son datos que cambian por acciones de otros (pedidos, sellos) y aqui interesa verlos al dia.
function apollo() {
  return useNuxtApp().$apollo.defaultClient;
}

// --- Listado ---
const search = ref("");
const customers = ref<CustomerSummary[]>([]);
const total = ref<number | null>(null);
const listLoading = ref(false);
const listError = ref("");
let listRequest = 0;

async function loadPage(reset: boolean) {
  const request = ++listRequest;
  listLoading.value = true;
  listError.value = "";
  try {
    const { data } = await apollo().query({
      query: CUSTOMERS_QUERY,
      variables: { search: search.value.trim() || null, limit: PAGE_SIZE, offset: reset ? 0 : customers.value.length },
      fetchPolicy: "network-only",
    });
    if (request !== listRequest) return; // llego tarde: ya hay otra busqueda en marcha
    customers.value = reset ? [...data.customers.items] : [...customers.value, ...data.customers.items];
    total.value = data.customers.total;
  } catch (err: any) {
    if (request === listRequest) listError.value = err?.message ?? "No se pudieron cargar los clientes";
  } finally {
    if (request === listRequest) listLoading.value = false;
  }
}

function loadMore() {
  loadPage(false);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPage(true), 300);
});
onMounted(() => loadPage(true));
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

// --- Ficha ---
const selectedId = ref("");
const detail = ref<any>(null);
const detailLoading = ref(false);
const detailError = ref("");

async function loadDetail() {
  detailLoading.value = true;
  detailError.value = "";
  try {
    const { data } = await apollo().query({
      query: DETAIL_QUERY,
      variables: { id: selectedId.value },
      fetchPolicy: "network-only",
    });
    detail.value = data.customerDetail;
  } catch (err: any) {
    detailError.value = err?.message ?? "No se pudo cargar el cliente";
  } finally {
    detailLoading.value = false;
  }
}

function openDetail(id: string) {
  selectedId.value = id;
  detail.value = null;
  stampsMessage.value = "";
  adjustStamps.value = null;
  adjustNote.value = "";
  loadDetail();
}

function closeDetail() {
  selectedId.value = "";
  detail.value = null;
  // Al volver, el listado refleja los cambios de sellos hechos en la ficha.
  loadPage(true);
}

// --- Sellos: canje en mostrador y ajustes ---
const stampsBusy = ref(false);
const stampsMessage = ref("");
const stampsError = ref(false);
const adjustStamps = ref<number | null>(null);
const adjustNote = ref("");

async function runStampsAction(action: () => Promise<unknown>, okMessage: string) {
  stampsBusy.value = true;
  stampsMessage.value = "";
  stampsError.value = false;
  try {
    await action();
    stampsMessage.value = okMessage;
    await loadDetail();
    return true;
  } catch (err: any) {
    stampsError.value = true;
    stampsMessage.value = err?.message ?? "No se pudo aplicar el cambio";
    return false;
  } finally {
    stampsBusy.value = false;
  }
}

async function redeem() {
  const { mutate } = useMutation(REDEEM);
  await runStampsAction(() => mutate({ customerId: selectedId.value }), "Recompensa canjeada ✓");
}

async function adjust() {
  const stamps = adjustStamps.value ?? 0;
  const { mutate } = useMutation(ADJUST);
  const ok = await runStampsAction(
    () => mutate({ customerId: selectedId.value, stamps, note: adjustNote.value.trim() }),
    `${stamps > 0 ? "Sumados" : "Restados"} ${Math.abs(stamps)} ${Math.abs(stamps) === 1 ? "sello" : "sellos"} ✓`
  );
  if (ok) {
    adjustStamps.value = null;
    adjustNote.value = "";
  }
}
</script>

<style scoped>
.customers-admin { max-width: 720px; }
.list-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.list-header h2 { margin: 0; }

input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
  min-width: 0;
}
.search { margin-bottom: 12px; }

.row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 10px; }
.row-info { flex: 1; min-width: 0; }
.row-info p { margin: 2px 0 0; }
.customer-row { width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.customer-row:hover { border-color: var(--accent); }
.row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.code { font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--accent); }

.stamps-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  color: var(--accent);
  white-space: nowrap;
}
.stamps-pill.reward { background: var(--accent); color: var(--bg); }
.reward-label { font-size: 11px; }
.load-more { margin-top: 14px; }

.back { margin-bottom: 16px; }
.detail-header h2 { margin: 0 0 4px; }
.detail-header p { margin: 0; }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 12px; }
.stat-value { font-size: 18px; font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
@media (max-width: 560px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.stamps-card { display: flex; flex-direction: column; gap: 12px; }
.stamps-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.stamps-head .eyebrow { margin: 0; }
.stamps-balance { margin: 2px 0 0; font-size: 20px; font-weight: 700; }
.adjust-form { display: flex; flex-direction: column; gap: 6px; }
.adjust-row { display: grid; grid-template-columns: minmax(0, 7rem) minmax(0, 1fr) auto; gap: 8px; }
@media (max-width: 480px) {
  .adjust-row { grid-template-columns: minmax(0, 6rem) minmax(0, 1fr); }
  .adjust-row button { grid-column: span 2; }
}

.detail-section { margin-top: 24px; }
.detail-section h3 { margin: 0 0 4px; }

.stamps-delta { font-weight: 700; color: var(--accent-strong); flex-shrink: 0; }
.stamps-delta.negative { color: var(--danger); }

.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--bg);
  background: var(--text-muted);
}
.status-badge.status-NUEVO { background: var(--color4); }
.status-badge.status-EN_PREPARACION { background: var(--color5); }
.status-badge.status-LISTO,
.status-badge.status-ENTREGADO { background: var(--accent-strong); }
.status-badge.status-CANCELADO { background: var(--danger); }
</style>
