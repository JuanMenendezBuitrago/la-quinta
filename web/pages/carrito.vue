<template>
  <main class="container page-cart">
    <header class="cart-header">
      <NuxtLink to="/" class="back-link" aria-label="Volver a la carta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </NuxtLink>
      <h1>Tu pedido</h1>
    </header>

    <p v-if="lines.length === 0" class="muted">Todavía no has añadido nada de la carta.</p>

    <div v-else class="order-lines">
      <div v-for="line in lines" :key="line.menuItemId" class="order-line">
        <img
          v-if="line.imageUrl"
          :src="line.imageUrl"
          :alt="line.name"
          class="line-image"
          role="button"
          tabindex="0"
          @click="openLightbox(line.imageUrl)"
          @keydown.enter="openLightbox(line.imageUrl)"
        />
        <div class="line-info">
          <span class="line-name">{{ line.name }}</span>
          <span class="line-meta">{{ line.quantity }} × {{ formatPrice(line.priceCents) }}</span>
        </div>
        <div class="qty">
          <button class="qty-btn" type="button" @click="setQuantity(line.menuItemId, line.quantity - 1)">−</button>
          <span class="qty-value">{{ line.quantity }}</span>
          <button class="qty-btn" type="button" @click="setQuantity(line.menuItemId, line.quantity + 1)">+</button>
        </div>
        <span class="line-subtotal price">{{ formatPrice(line.priceCents * line.quantity) }}</span>
      </div>

      <div class="total-row">
        <span>Total</span>
        <span class="total-amount price">{{ formatPrice(totalCents) }}</span>
      </div>
    </div>

    <div v-if="lines.length" class="pickup-card">
      <p class="eyebrow">Recogida en tienda</p>
      <div class="pickup-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
        <input id="pickup" v-model="pickupSlot" type="datetime-local" />
      </div>

      <template v-if="!customer">
        <p class="muted" style="margin-top: 16px">
          Inicia sesión para confirmar el pedido — así podemos avisarte cuando esté listo y sumar tus sellos.
        </p>
        <LoginInline @logged-in="submitOrder" />
      </template>

      <p v-if="orderError" class="muted" style="color: var(--danger)">{{ orderError }}</p>
    </div>

    <div v-if="confirmedOrder" class="card confirm-card">
      <strong>¡Pedido confirmado!</strong>
      <p class="order-code">{{ confirmedOrder }}</p>
      <p class="muted">Recógelo en tu franja horaria y paga en el mostrador. Te avisaremos cuando esté listo.</p>
    </div>

    <div v-if="showCheckoutBar" class="checkout-bar">
      <button class="button" :disabled="submitting" @click="submitOrder">
        {{ submitting ? "Enviando…" : "Confirmar pedido · pago en tienda" }}
      </button>
      <p class="checkout-note">Te avisaremos cuando esté listo para recoger.</p>
    </div>
    <div v-if="showCheckoutBar" class="bottom-spacer" />

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </main>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useCart } from "~/composables/useCart";
import { useAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import ImageLightbox from "~/components/ImageLightbox.vue";

const CREATE_ORDER = gql`
  mutation CreateOrder($items: [OrderLineInput!]!, $pickupSlot: String!) {
    createOrder(items: $items, pickupSlot: $pickupSlot) {
      id
      code
      status
      pickupSlot
    }
  }
`;

const { lines, setQuantity, totalCents, clear } = useCart();
const { customer } = useAuth();

const pickupSlot = ref(defaultPickupSlot());
const submitting = ref(false);
const orderError = ref("");
// Codigo del pedido recien creado; vacio mientras no se haya confirmado.
const confirmedOrder = ref("");

const showCheckoutBar = computed(() => lines.value.length > 0 && !!customer.value && !confirmedOrder.value);

const { lightboxUrl, openLightbox, closeLightbox } = useLightbox();

function defaultPickupSlot() {
  const inHalfHour = new Date(Date.now() + 30 * 60 * 1000);
  return inHalfHour.toISOString().slice(0, 16);
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

async function submitOrder() {
  if (lines.value.length === 0) return;
  submitting.value = true;
  orderError.value = "";

  try {
    const { mutate } = useMutation(CREATE_ORDER);
    const result = await mutate({
      items: lines.value.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      pickupSlot: new Date(pickupSlot.value).toISOString(),
    });
    confirmedOrder.value = result?.data?.createOrder.code ?? "";
    clear();
  } catch (err: any) {
    orderError.value = err?.message ?? "No se pudo enviar el pedido";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.cart-header { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
.back-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  color: var(--accent);
  text-decoration: none;
  flex-shrink: 0;
}
.back-link:hover { border-color: var(--accent); }

.order-lines { margin-bottom: 24px; }
.order-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.line-image {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border);
  cursor: zoom-in;
}
.line-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.line-name { font-family: var(--font-serif); font-size: 16px; color: var(--text); }
.line-meta { font-size: 12.5px; color: var(--text-muted); }
.line-subtotal { flex-shrink: 0; color: var(--accent); font-size: 14px; font-weight: 600; }

.qty { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.qty-btn:hover { border-color: var(--accent); color: var(--accent); }
.qty-value { min-width: 16px; text-align: center; font-variant-numeric: tabular-nums; }

.total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 16px;
  border-top: 1px solid var(--border-strong);
  font-family: var(--font-serif);
  font-size: 18px;
}
.total-amount { color: var(--accent); font-weight: 600; }

.pickup-card { margin-top: 4px; }
.pickup-field {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 10px 16px;
  background: var(--surface);
}
.pickup-field svg { color: var(--accent); flex-shrink: 0; }
.pickup-field input {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
}
.pickup-field input:focus { outline: none; }

.confirm-card { margin-top: 20px; border-color: var(--accent); background: rgba(201, 161, 90, 0.08); }
.confirm-card .order-code {
  margin: 8px 0 4px;
  font-family: ui-monospace, monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.checkout-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: var(--surface-alt);
  border-top: 1px solid var(--border-strong);
  padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
  text-align: center;
}
.checkout-bar .button { width: 100%; }
.checkout-note { margin: 8px 0 0; font-size: 12px; color: var(--text-muted); }
.bottom-spacer { height: 96px; }
</style>
