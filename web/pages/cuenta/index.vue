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
      <p class="muted">Inicia sesión con tu email para ver tus sellos y tus pedidos.</p>
      <LoginInline @logged-in="onLoggedIn" />
    </template>

    <template v-else>
      <header class="account-hero wide-head">
        <p class="eyebrow">Mi cuenta</p>
        <h1 class="hello">
          <UserAvatar :avatar="customer.avatar" :name="customer.name" :size="48" />
          Hola, {{ customer.name }}
        </h1>
      </header>

      <!-- Pantallas anchas apaisadas: pedidos, favoritos y opinion a la izquierda; codigo, sellos,
           avatar y datos a la derecha. En movil, el orden de siempre (style="order"). -->
      <div class="wide-layout wide-layout--ordered account-layout">
        <div class="wide-main">
          <section style="order: 4" class="favorites-section">
            <p class="eyebrow">Tus favoritos</p>
            <div class="card">
              <FavoritesList />
            </div>
          </section>

          <section style="order: 5" class="orders-section">
            <p class="eyebrow">Pedidos recientes</p>
            <EmptyState v-if="!orders?.length" :icon="ShoppingBag" title="Todavía no has hecho ningún pedido"><NuxtLink to="/">Ver la carta</NuxtLink></EmptyState>
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
                <span class="order-name">{{
                  order.items
                    .map((i: any) => {
                      const changed = (i.options ?? []).filter((o: any) => !o.isDefault).map((o: any) => o.name);
                      return `${i.quantity}× ${i.name}${changed.length ? ` (${changed.join(", ")})` : ""}`;
                    })
                    .join(", ")
                }}</span>
                <span class="order-date">
                  {{ order.code }} · {{ formatDate(order.pickupSlot) }}{{ order.table ? ` · ${tableLabel(order.table)}` : "" }}
                </span>
              </div>
              <span class="status" :data-status="order.status">{{ statusLabel(order.status) }}</span>
              <!-- Opinion sobre el pedido: solo ya entregado -->
              <div v-if="order.status === 'ENTREGADO'" class="order-review">
                <ReviewForm
                  v-if="editingOrderId === order.id"
                  :order-id="order.id"
                  :existing="reviewByOrder.get(order.id) ?? null"
                  cancellable
                  @saved="onReviewSaved"
                  @cancel="editingOrderId = ''"
                />
                <div v-else-if="reviewByOrder.get(order.id)" class="review-summary">
                  <StarRating :model-value="reviewByOrder.get(order.id)!.rating" display :size="16" />
                  <span v-if="reviewByOrder.get(order.id)!.comment" class="review-comment">«{{ reviewByOrder.get(order.id)!.comment }}»</span>
                  <button type="button" class="link-button" @click="editingOrderId = order.id">Editar</button>
                </div>
                <button v-else type="button" class="link-button rate" @click="editingOrderId = order.id">
                  <Star :size="14" :stroke-width="1.8" aria-hidden="true" />
                  ¿Qué tal tu pedido? Valóralo
                </button>
              </div>
            </div>
          </section>

          <section style="order: 6" class="review-section">
            <p class="eyebrow">Tu opinión sobre La Quinta</p>
            <div class="card">
              <p class="muted review-intro">¿Cómo ha sido tu experiencia con nosotros? Solo la lee el equipo del local.</p>
              <ReviewForm :key="generalReview?.id ?? 'nueva'" :existing="generalReview" @saved="onReviewSaved" />
            </div>
          </section>

        </div>
        <aside class="wide-aside">
          <div style="order: 1" class="card customer-card">
            <div>
              <span class="customer-code-label">Código de cliente</span>
              <div class="customer-code">{{ customer.customerCode }}</div>
            </div>
            <button class="button secondary" @click="logout">Cerrar sesión</button>
          </div>

          <section style="order: 3" class="loyalty-section">
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

          <section style="order: 2" class="avatar-section">
            <p class="eyebrow">Tu avatar</p>
            <div class="card">
              <AvatarPicker who="customer" :avatar="customer.avatar" :name="customer.name" />
            </div>
          </section>

          <MyDataSection style="order: 7" @deleted="accountDeleted = true" />
        </aside>
      </div>
    </template>

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </main>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { gql } from "graphql-tag";
import { useAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import ImageLightbox from "~/components/ImageLightbox.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import AvatarPicker from "~/components/AvatarPicker.vue";
import FavoritesList from "~/components/FavoritesList.vue";
import ReviewForm, { type MyReview } from "~/components/ReviewForm.vue";
import StarRating from "~/components/StarRating.vue";
import { ShoppingBag, Star } from "lucide-vue-next";
import { useImageUrl } from "~/composables/useImageUrl";
import { tableLabel } from "~/composables/useTables";

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
      table
      items {
        name
        quantity
        imageUrl
        options {
          name
          isDefault
        }
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

const MY_REVIEWS = gql`
  query MyReviews {
    myReviews {
      id
      orderId
      rating
      comment
    }
  }
`;
const { result: reviewsResult } = useQuery<{ myReviews: MyReview[] }>(MY_REVIEWS, null, () => ({
  enabled: !!customer.value,
}));
// Lo guardado aqui se superpone a lo que vino de la API: se ve al momento sin volver a pedir la
// lista. Es un computed (no un watch que copie): asi el HTML del servidor ya sale con las opiniones
// y la hidratacion no se descuadra.
const localReviews = ref<MyReview[] | null>(null);
const myReviews = computed(() => localReviews.value ?? reviewsResult.value?.myReviews ?? []);
const reviewByOrder = computed(() => new Map(myReviews.value.filter((r) => r.orderId).map((r) => [r.orderId!, r])));
const generalReview = computed(() => myReviews.value.find((r) => !r.orderId) ?? null);
const editingOrderId = ref("");
function onReviewSaved(review: MyReview) {
  localReviews.value = [...myReviews.value.filter((r) => r.id !== review.id), review];
  editingOrderId.value = "";
}

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

.hello { display: flex; align-items: center; gap: 14px; }
.avatar-section, .loyalty-section, .favorites-section, .orders-section, .review-section { margin-top: 32px; }
.account-layout { row-gap: 0; }
.account-layout .wide-main, .account-layout .wide-aside { gap: 0; }
@media (min-width: 1000px) and (orientation: landscape) {
  .account-layout .wide-main > :first-child, .account-layout .wide-aside > :first-child { margin-top: 0; }
}

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
/* Cada sello es un querubin (claro u oscuro segun el tema, ver --stamp-img); los pendientes, tenues. */
.stamp { width: 24px; height: 34px; background: var(--stamp-img) center / contain no-repeat; opacity: 0.22; }
.stamp.filled { opacity: 1; }
.stamps-label { color: var(--text-muted); font-size: 13px; margin: 0; }

.order-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.order-row:last-child { border-bottom: none; }
.order-review { flex-basis: 100%; }
.review-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.review-comment { color: var(--text-muted); font-style: italic; min-width: 0; overflow-wrap: anywhere; }
.link-button {
  border: none;
  background: none;
  padding: 2px 0;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.link-button.rate { display: inline-flex; align-items: center; gap: 6px; }
.review-intro { margin: 0 0 10px; }
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
