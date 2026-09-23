<template>
  <main class="container page-account">
    <template v-if="!customer">
      <header class="account-hero">
        <p class="eyebrow">Mi cuenta</p>
        <h1>Bienvenido</h1>
      </header>
      <p v-if="accountDeleted" class="card deleted-notice" role="status">
        Tu cuenta se ha eliminado. Hemos borrado tu nombre, email y teléfono.
      </p>
      <p class="muted">Inicia sesión con tu email o teléfono para ver tus sellos y tus pedidos.</p>
      <LoginInline @logged-in="onLoggedIn" />
    </template>

    <template v-else>
      <header class="account-hero">
        <p class="eyebrow">Mi cuenta</p>
        <h1>Hola, {{ customer.name }}</h1>
      </header>

      <div class="card customer-card">
        <div>
          <span class="customer-code-label">Código de cliente</span>
          <div class="customer-code">{{ customer.customerCode }}</div>
        </div>
        <button class="button secondary" @click="logout">Cerrar sesión</button>
      </div>

      <section class="loyalty-section">
        <p class="eyebrow">Fidelización</p>
        <div v-if="loyalty" class="card loyalty-card">
          <div class="stamps-grid">
            <span
              v-for="i in loyalty.rewardThreshold"
              :key="i"
              class="stamp"
              :class="{ filled: i <= loyalty.balance }"
            />
          </div>
          <p class="stamps-label">{{ loyalty.balance }} de {{ loyalty.rewardThreshold }} sellos</p>
          <button v-if="loyalty.rewardAvailable" class="button" :disabled="redeeming" @click="redeem">
            {{ redeeming ? "Canjeando…" : "Canjear recompensa" }}
          </button>
        </div>
      </section>

      <section class="orders-section">
        <p class="eyebrow">Pedidos recientes</p>
        <p v-if="!orders?.length" class="muted">Todavía no has hecho ningún pedido.</p>
        <div v-for="order in orders" :key="order.id" class="order-row">
          <div v-if="orderImages(order).length" class="order-thumbs">
            <img
              v-for="img in orderImages(order)"
              :key="img"
              :src="img"
              alt=""
              class="order-thumb"
              role="button"
              tabindex="0"
              @click="openLightbox(img)"
              @keydown.enter="openLightbox(img)"
            />
          </div>
          <div class="order-info">
            <span class="order-name">{{ order.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ") }}</span>
            <span class="order-date">{{ order.code }} · {{ formatDate(order.pickupSlot) }}</span>
          </div>
          <span class="status" :data-status="order.status">{{ statusLabel(order.status) }}</span>
        </div>
      </section>

      <MyDataSection @deleted="accountDeleted = true" />
    </template>

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </main>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import ImageLightbox from "~/components/ImageLightbox.vue";
import { useImageUrl } from "~/composables/useImageUrl";

const LOYALTY_QUERY = gql`
  query MyLoyaltyStatus {
    myLoyaltyStatus {
      balance
      rewardThreshold
      rewardAvailable
    }
  }
`;

const ORDERS_QUERY = gql`
  query MyOrders {
    myOrders {
      id
      code
      status
      pickupSlot
      items {
        name
        quantity
        imageUrl
      }
    }
  }
`;

const REDEEM = gql`
  mutation RedeemLoyaltyReward {
    redeemLoyaltyReward {
      balance
      rewardAvailable
    }
  }
`;

const STATUS_SUBSCRIPTION = gql`
  subscription MyOrderStatusChanged {
    orderStatusChanged {
      id
      status
    }
  }
`;

const { customer, logout } = useAuth();
const redeeming = ref(false);
const accountDeleted = ref(false);

const { result: loyaltyResult, refetch: refetchLoyalty } = useQuery(LOYALTY_QUERY, null, () => ({
  enabled: !!customer.value,
}));
const { result: ordersResult, refetch: refetchOrders } = useQuery(ORDERS_QUERY, null, () => ({
  enabled: !!customer.value,
}));

const loyalty = computed(() => loyaltyResult.value?.myLoyaltyStatus);
const orders = computed(() => ordersResult.value?.myOrders ?? []);

const { lightboxUrl, openLightbox, closeLightbox } = useLightbox();
const { resolveImageUrl } = useImageUrl();

function orderImages(order: any): string[] {
  const urls = order.items.map((i: any) => resolveImageUrl(i.imageUrl)).filter(Boolean);
  return [...new Set(urls)] as string[];
}

// Tiempo real: cuando el personal cambia el estado de uno de mis pedidos, se refresca la lista
// (y los sellos si se ha entregado; el sello lo suma un listener asincrono, de ahi la pausa).
const { onResult: onStatusChanged } = useSubscription(STATUS_SUBSCRIPTION, null, () => ({
  enabled: !!customer.value,
}));
onStatusChanged(async (r) => {
  await refetchOrders();
  if (r.data?.orderStatusChanged?.status === "ENTREGADO") {
    setTimeout(() => refetchLoyalty(), 600);
  }
});

async function onLoggedIn() {
  await Promise.all([refetchLoyalty(), refetchOrders()]);
}

async function redeem() {
  redeeming.value = true;
  try {
    const { mutate } = useMutation(REDEEM);
    await mutate();
    await refetchLoyalty();
  } finally {
    redeeming.value = false;
  }
}

const { formatDateTime: formatDate } = useStoreTime();

const STATUS_LABELS: Record<string, string> = {
  NUEVO: "Recibido",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo para recoger",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
</script>

<style scoped>
.account-hero { margin-bottom: 22px; }
.deleted-notice { margin-bottom: 16px; font-size: 14px; }

.customer-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}
.customer-code-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}
.customer-code { font-family: var(--font-serif); font-size: 20px; color: var(--text); letter-spacing: 0.02em; }

.loyalty-section, .orders-section { margin-top: 32px; }

.loyalty-card {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  padding: 26px 20px;
}
.stamps-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 260px; }
.stamp { width: 22px; height: 22px; border-radius: 50%; border: 1.4px solid var(--accent); background: transparent; }
.stamp.filled { background: var(--accent); }
.stamps-label { color: var(--text-muted); font-size: 13px; margin: 0; }

.order-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.order-row:last-child { border-bottom: none; }
.order-thumbs { display: flex; gap: 6px; flex-shrink: 0; }
.order-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border);
  cursor: zoom-in;
}
.order-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.order-name { font-family: var(--font-serif); font-size: 15px; color: var(--text); }
.order-date { font-size: 12.5px; color: var(--text-muted); }

.status {
  flex-shrink: 0;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.status[data-status="LISTO"], .status[data-status="ENTREGADO"] {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(201, 161, 90, 0.12);
}
</style>
