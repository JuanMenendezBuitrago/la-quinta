<template>
  <main class="container page-account">
    <!-- Sin sesion: bienvenida con lo que da tener cuenta (tarjeta de sellos de muestra que se
         llena sola) y el acceso. En movil, el acceso justo despues del titular (grid-areas). -->
    <section v-if="!customer" class="welcome">
      <header class="welcome-intro">
        <p class="eyebrow">Mi cuenta</p>
        <h1 class="welcome-title">Qué bueno <em>verte por aquí</em></h1>
        <p class="welcome-lead">
          Cada café suma. Entra con tu email, llena tu tarjeta de sellos y el siguiente corre por nuestra cuenta.
        </p>
      </header>

      <div class="card welcome-login">
        <p v-if="accountDeleted" class="deleted-notice" role="status">
          Tu cuenta se ha eliminado. Hemos borrado tu nombre, email y teléfono.
        </p>
        <h2>Entra o crea tu cuenta</h2>
        <p class="muted welcome-login-hint">
          <Mail :size="15" aria-hidden="true" />
          Sin contraseñas: te enviamos un código a tu email.
        </p>
        <LoginInline @logged-in="onLoggedIn" />
      </div>

      <div class="welcome-extras">
        <div class="welcome-stamps">
          <StampsGrid :balance="rewardThreshold" :threshold="rewardThreshold" animated />
          <p class="welcome-reward" :style="{ animationDelay: `${0.6 + rewardThreshold * 0.18}s` }">
            <Gift :size="16" aria-hidden="true" /> {{ rewardThreshold }} sellos = un producto gratis
          </p>
        </div>
        <ul class="perks">
          <li>
            <span class="perk-icon"><Stamp :size="18" aria-hidden="true" /></span>
            <span><strong>Sellos en cada visita.</strong> {{ stampsRuleText || "Los ganas con cada pedido." }}</span>
          </li>
          <li>
            <span class="perk-icon"><ShoppingBag :size="18" aria-hidden="true" /></span>
            <span><strong>Tus pedidos al momento.</strong> Ves cuándo está listo lo que pediste.</span>
          </li>
          <li>
            <span class="perk-icon"><Heart :size="18" aria-hidden="true" /></span>
            <span><strong>Tus favoritos a mano.</strong> Lo de siempre, a un toque.</span>
          </li>
          <li>
            <span class="perk-icon"><Camera :size="18" aria-hidden="true" /></span>
            <span><strong>Una foto, un sello más.</strong> Si publicamos la foto de tu pedido, te lo sumamos.</span>
          </li>
        </ul>
      </div>
    </section>

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
                <!-- Fotos de lo que pidio: hasta 30 dias despues de la entrega (lo comprueba la API) -->
                <ProductPhotoUpload
                  v-if="photoOrderId === order.id"
                  :order-id="order.id"
                  :items="order.items"
                  @sent="onPhotoSent"
                  @cancel="photoOrderId = ''"
                />
                <button v-else-if="canSendPhotos(order)" type="button" class="link-button rate photo-link" @click="photoOrderId = order.id">
                  <Camera :size="14" :stroke-width="1.8" aria-hidden="true" />
                  Envíanos una foto de tu pedido
                </button>
              </div>
            </div>
          </section>

          <!-- Fotos enviadas: su estado y, si se quiere, retirarlas -->
          <section v-if="myPhotos.length" style="order: 5" class="photos-section">
            <p class="eyebrow">Mis fotos</p>
            <p v-if="photoNotice" class="muted photo-notice" role="status">{{ photoNotice }}</p>
            <div class="my-photos">
              <figure v-for="p in myPhotos" :key="p.id" class="my-photo">
                <img v-if="p.url" :src="resolveImageUrl(p.url) ?? ''" :alt="`Tu foto de ${p.menuItemName}`" />
                <div v-else class="my-photo-gone" aria-hidden="true"><Camera :size="20" :stroke-width="1.6" /></div>
                <figcaption>
                  <strong>{{ p.menuItemName }}</strong>
                  <span class="photo-status" :data-status="p.status">{{ PHOTO_STATUS_LABELS[p.status] }}</span>
                  <span v-if="p.rejectReason" class="muted">{{ p.rejectReason }}</span>
                  <button type="button" class="link-button" :disabled="withdrawingId === p.id" @click="withdrawPhoto(p.id)">
                    {{ p.status === "RECHAZADA" ? "Quitar" : "Retirar" }}
                  </button>
                </figcaption>
              </figure>
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
              <StampsGrid :balance="loyalty.balance" :threshold="loyalty.rewardThreshold" />
              <p class="stamps-label">{{ loyalty.balance }} de {{ loyalty.rewardThreshold }} sellos</p>
              <p v-if="stampsRuleText" class="stamps-rule">
                {{ stampsRuleText }} Con {{ loyalty.rewardThreshold }}, un producto gratis.
              </p>
              <!-- El canje se hace en el local, como descuento del pedido (asi el producto gratis
                   queda ligado al ticket y los sellos vuelven si se cancela). -->
              <p v-if="loyalty.rewardAvailable" class="reward-hint">
                ¡Tienes un producto gratis! Pídelo en el local y da tu código de cliente al hacer el pedido.
              </p>
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
import { useRewardThreshold, useStampsRuleText } from "~/composables/useSiteSettings";
import { useLightbox } from "~/composables/useLightbox";
import ImageLightbox from "~/components/ImageLightbox.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import AvatarPicker from "~/components/AvatarPicker.vue";
import FavoritesList from "~/components/FavoritesList.vue";
import ReviewForm, { type MyReview } from "~/components/ReviewForm.vue";
import ProductPhotoUpload from "~/components/ProductPhotoUpload.vue";
import StarRating from "~/components/StarRating.vue";
import { Camera, Gift, Heart, Mail, ShoppingBag, Stamp, Star } from "lucide-vue-next";
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
      deliveredAt
      table
      items {
        menuItemId
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

const STATUS_SUBSCRIPTION = gql`
  subscription MyOrderStatusChanged {
    orderStatusChanged {
      id
      status
    }
  }
`;

const { customer, logout } = useAuth();
const stampsRuleText = useStampsRuleText();
const rewardThreshold = useRewardThreshold();
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

// --- Fotos de clientes: se envian desde cada pedido entregado y las revisa el local ---
const MY_PHOTOS = gql`
  query MyProductPhotos {
    myProductPhotos {
      id
      url
      menuItemName
      orderCode
      status
      rejectReason
      createdAt
    }
  }
`;
const WITHDRAW_PHOTO = gql`
  mutation WithdrawProductPhoto($id: ID!) {
    withdrawProductPhoto(id: $id)
  }
`;
type PhotoStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA";
const PHOTO_STATUS_LABELS: Record<PhotoStatus, string> = {
  PENDIENTE: "Pendiente de revisar",
  APROBADA: "Publicada en la carta",
  RECHAZADA: "No publicada",
};
const PHOTO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // como PHOTO_ORDER_MAX_AGE_DAYS en la API
const { result: photosResult, refetch: refetchPhotos } = useQuery<{
  myProductPhotos: { id: string; url: string | null; menuItemName: string; status: PhotoStatus; rejectReason: string | null }[];
}>(MY_PHOTOS, null, () => ({ enabled: !!customer.value }));
const myPhotos = computed(() => photosResult.value?.myProductPhotos ?? []);
const photoOrderId = ref("");
const photoNotice = ref("");
const withdrawingId = ref("");
function canSendPhotos(order: any) {
  const delivered = order.deliveredAt ? new Date(order.deliveredAt).getTime() : 0;
  return !!delivered && Date.now() - delivered < PHOTO_MAX_AGE_MS;
}
async function onPhotoSent() {
  photoOrderId.value = "";
  photoNotice.value = "¡Gracias! La revisaremos pronto; si la publicamos, te sumamos un sello.";
  await refetchPhotos();
}
async function withdrawPhoto(id: string) {
  withdrawingId.value = id;
  try {
    const { mutate } = useMutation(WITHDRAW_PHOTO);
    await mutate({ id });
    photoNotice.value = "";
    await refetchPhotos();
  } finally {
    withdrawingId.value = "";
  }
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
.deleted-notice { margin: 0 0 4px; font-size: 14px; color: var(--text-muted); }

/* --- Bienvenida (sin sesion) --- */
.welcome {
  display: grid;
  grid-template-areas: "intro" "login" "extras";
  gap: 22px;
  padding-top: 8px;
}
.welcome-intro { grid-area: intro; }
.welcome-login { grid-area: login; }
.welcome-extras { grid-area: extras; display: flex; flex-direction: column; gap: 22px; }
@media (min-width: 860px) {
  .welcome {
    --wide-width: min(1040px, calc(100vw - 40px));
    width: var(--wide-width);
    margin-left: calc((100% - var(--wide-width)) / 2);
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    grid-template-areas: "intro login" "extras login";
    column-gap: 56px;
    row-gap: 28px;
    align-items: start;
    padding-top: 36px;
  }
  .welcome-login { position: sticky; top: 96px; }
}

.welcome-title { font-size: clamp(34px, 6vw, 52px); line-height: 1.02; letter-spacing: -0.01em; }
.welcome-title em {
  display: block;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  color: var(--accent);
}
.welcome-lead { margin: 16px 0 0; max-width: 30em; font-size: 17px; line-height: 1.55; color: var(--text-muted); }

.welcome-login {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 26px 24px;
  border-color: var(--border-strong);
  background:
    radial-gradient(120% 80% at 100% 0%, var(--accent-soft), transparent 60%),
    var(--surface);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}
.welcome-login h2 { font-size: 22px; }
.welcome-login-hint { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; }
.welcome-login :deep(.login-inline) { max-width: none; }

.welcome-stamps {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  background: var(--surface);
}
/* Muestra de la tarjeta: sellos mas grandes, cinco por fila */
.welcome-stamps :deep(.stamps-grid) { max-width: 214px; gap: 12px; }
.welcome-stamps :deep(.stamp) { width: 32px; height: 45px; }
.welcome-reward {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font-size: 14px;
  font-weight: 600;
  animation: reward-in 0.5s ease-out both;
}
@keyframes reward-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-reward { animation: none; }
}

.perks { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.perks li { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; line-height: 1.5; color: var(--text-muted); }
.perks strong { color: var(--text); font-weight: 600; }
.perk-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-strong);
}

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
.stamps-label { color: var(--text-muted); font-size: 13px; margin: 0; }
.reward-hint { margin: 0; font-weight: 600; text-align: center; }
.stamps-rule { margin: -6px 0 0; max-width: 280px; font-size: 13px; color: var(--text-muted); }

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
.link-button.photo-link { display: flex; margin-top: 6px; }
.photos-section .photo-notice { margin: 0 0 10px; color: var(--accent); }
.my-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.my-photo { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.my-photo img, .my-photo-gone { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; background: var(--surface-alt); }
.my-photo-gone { display: grid; place-items: center; color: var(--text-muted); }
.my-photo figcaption { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; font-size: 13px; }
.photo-status { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.photo-status[data-status="APROBADA"] { color: var(--accent); }
.photo-status[data-status="RECHAZADA"] { color: var(--danger); }
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
