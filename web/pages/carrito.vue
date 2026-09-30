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

    <p v-if="!canOrder" class="muted">
      Ahora mismo los pedidos se hacen con el personal del local. Puedes ver tus pedidos en
      <NuxtLink to="/cuenta">Mi cuenta</NuxtLink>.
    </p>

    <template v-else>
      <p v-if="lines.length === 0" class="muted">Todavía no has añadido nada de la carta.</p>

      <div v-else class="order-lines">
        <div v-for="line in lines" :key="line.key" class="order-line">
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
            <LineOptionsPicker
              class="line-picker"
              :modifiers="modifiersOf(line.menuItemId)"
              :options="line.options"
              @change="setOptions(line.key, $event)"
            />
          </div>
          <div class="qty">
            <button class="qty-btn" type="button" @click="setQuantity(line.key, line.quantity - 1)">−</button>
            <span class="qty-value">{{ line.quantity }}</span>
            <button class="qty-btn" type="button" @click="setQuantity(line.key, line.quantity + 1)">+</button>
          </div>
          <span class="line-subtotal price">{{ formatPrice(line.priceCents * line.quantity) }}</span>
        </div>

        <div class="total-row">
          <span>Total</span>
          <span class="total-amount price">{{ formatPrice(totalCents) }}</span>
        </div>
      </div>

      <div v-if="lines.length" class="pickup-card">
        <div class="where" role="radiogroup" aria-label="Recoger en tienda o pedir desde la mesa">
          <button type="button" role="radio" :aria-checked="!atTable" :class="{ active: !atTable }" @click="atTable = false">
            Recoger en tienda
          </button>
          <button type="button" role="radio" :aria-checked="atTable" :class="{ active: atTable }" @click="atTable = true">
            Estoy en el local
          </button>
        </div>

        <template v-if="atTable">
          <p class="eyebrow">¿Dónde estás?</p>
          <div class="tables" role="radiogroup" aria-label="Mesa o barra">
            <button
              v-for="t in TABLES"
              :key="t.id"
              type="button"
              role="radio"
              :aria-checked="table === t.id"
              :class="{ active: table === t.id, wide: t.id === BAR_TABLE }"
              @click="table = t.id"
            >
              {{ t.label }}
            </button>
          </div>
          <p class="muted table-note">Te lo llevamos a la mesa en cuanto esté. Pagas allí o en la barra.</p>
        </template>

        <template v-else>
          <p class="eyebrow">Recogida en tienda</p>
          <div class="pickup-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" />
            </svg>
            <input
              id="pickup"
              v-model="pickupSlot"
              type="datetime-local"
              :min="minPickupSlot"
              @input="pickupTouched = true"
            />
          </div>
          <p v-if="pickupProblem" class="muted pickup-problem" role="alert">{{ pickupProblem }}</p>
        </template>

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
        <p class="order-code">{{ confirmedOrder.code }}</p>
        <p v-if="confirmedOrder.table" class="muted">
          Te lo llevamos a {{ confirmedOrder.table === BAR_TABLE ? "la barra" : `la ${tableLabel(confirmedOrder.table).toLowerCase()}` }}
          en cuanto esté. Puedes pagar allí o en la barra.
        </p>
        <p v-else class="muted">Recógelo en tu franja horaria y paga en el mostrador. Te avisaremos cuando esté listo.</p>
      </div>

      <div v-if="showCheckoutBar" class="checkout-bar">
        <button class="button" :disabled="submitting || missingChoice || (atTable && !table)" @click="submitOrder">
          {{ submitting ? "Enviando…" : submitLabel }}
        </button>
        <p class="checkout-note">
          <template v-if="missingChoice">Elige la opción marcada en rojo: la de siempre está agotada ahora.</template>
          <template v-else>
            {{ atTable ? "Te avisaremos cuando esté listo y te lo llevamos." : "Te avisaremos cuando esté listo para recoger." }}
          </template>
        </p>
      </div>
      <div v-if="showCheckoutBar" class="bottom-spacer" />
    </template>

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </main>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { orderLinesInput, useCart } from "~/composables/useCart";
import { MENU_QUERY, missingModifiers, type MenuCategory } from "~/composables/useMenu";
import LineOptionsPicker from "~/components/LineOptionsPicker.vue";
import { useAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import { SITE_SETTINGS_QUERY, useCustomerOrdering, type SiteSettings } from "~/composables/useSiteSettings";
import { firstPickupSlot, pickupOutsideHoursReason } from "~/composables/useStoreTime";
import { BAR_TABLE, TABLES, tableLabel, useCustomerTable } from "~/composables/useTables";
import ImageLightbox from "~/components/ImageLightbox.vue";

const CREATE_ORDER = gql`
  mutation CreateOrder($items: [OrderLineInput!]!, $pickupSlot: String, $table: String) {
    createOrder(items: $items, pickupSlot: $pickupSlot, table: $table) {
      id
      code
      status
      pickupSlot
      table
    }
  }
`;

const { lines, setQuantity, setOptions, totalCents, clear } = useCart();

// Personalizaciones de cada producto (p. ej. Leche): mismo query que la carta, sale de la cache.
const { result: menuResult } = useQuery<{ menu: MenuCategory[] }>(MENU_QUERY);
const itemsById = computed(() => new Map((menuResult.value?.menu ?? []).flatMap((c) => c.items).map((i) => [i.id, i])));
function modifiersOf(menuItemId: string) {
  return itemsById.value.get(menuItemId)?.modifiers ?? [];
}
// Una linea con una personalizacion obligatoria sin elegir (su opcion de siempre esta agotada).
const missingChoice = computed(() => lines.value.some((l) => missingModifiers(modifiersOf(l.menuItemId), l.options).length));
const { customer } = useAuth();
// "Solo el personal crea pedidos": la pagina solo explica donde ver los pedidos.
const canOrder = useCustomerOrdering();

const { toStoreInput, fromStoreInput } = useStoreTime();

// Mismo query que el pie de pagina: sale de la cache de Apollo, sin otra peticion.
const { result: settingsResult } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const openingHours = computed(() => settingsResult.value?.siteSettings.openingHours ?? null);

// El input muestra y recoge la hora de la tienda (ver useStoreTime), no la del navegador.
// Por defecto, dentro de media hora; si a esa hora la tienda esta cerrada, en la siguiente apertura.
const earliestPickup = toStoreInput(new Date(Date.now() + 30 * 60 * 1000));
const pickupSlot = ref(earliestPickup);
const minPickupSlot = toStoreInput(new Date());
// Si el cliente ya ha elegido una hora, no se le cambia aunque el horario llegue despues.
const pickupTouched = ref(false);
watch(
  openingHours,
  (hours) => {
    if (!hours || pickupTouched.value) return;
    pickupSlot.value = firstPickupSlot(earliestPickup, hours) ?? earliestPickup;
  },
  { immediate: true }
);

// En el local (con ?mesa=... ya viene elegida) o para recoger. Solo al recoger cuenta la hora.
const table = useCustomerTable();
const atTable = ref(!!table.value);
const submitLabel = computed(() => {
  if (!atTable.value) return "Confirmar pedido · pago en tienda";
  if (!table.value) return "Elige tu mesa";
  return `Pedir a ${table.value === BAR_TABLE ? "la barra" : tableLabel(table.value).toLowerCase()}`;
});

const pickupProblem = computed(() =>
  openingHours.value && pickupSlot.value ? pickupOutsideHoursReason(pickupSlot.value, openingHours.value) : null
);
const submitting = ref(false);
const orderError = ref("");
// Pedido recien creado; null mientras no se haya confirmado.
const confirmedOrder = ref<{ code: string; table: string | null } | null>(null);

const showCheckoutBar = computed(() => lines.value.length > 0 && !!customer.value && !confirmedOrder.value);

const { lightboxUrl, openLightbox, closeLightbox } = useLightbox();

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

async function submitOrder() {
  if (lines.value.length === 0) return;
  if (missingChoice.value) {
    orderError.value = "Elige la opción marcada en rojo: la de siempre está agotada ahora";
    return;
  }
  if (atTable.value && !table.value) {
    orderError.value = "Elige tu mesa o la barra";
    return;
  }
  if (!atTable.value && pickupProblem.value) {
    orderError.value = pickupProblem.value;
    return;
  }
  submitting.value = true;
  orderError.value = "";

  try {
    const { mutate } = useMutation(CREATE_ORDER);
    const result = await mutate({
      items: orderLinesInput(lines.value),
      ...(atTable.value
        ? { table: table.value }
        : { pickupSlot: fromStoreInput(pickupSlot.value).toISOString() }),
    });
    const created = result?.data?.createOrder;
    confirmedOrder.value = created ? { code: created.code, table: created.table ?? null } : null;
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
.line-picker { margin-top: 6px; max-width: 280px; }
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

.where {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  margin-bottom: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
}
.where button {
  min-height: 40px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.where button.active { background: var(--accent); color: var(--bg); }

.tables { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.tables button {
  min-height: 48px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.tables button.wide { grid-column: span 3; }
.tables button.active { background: var(--accent); color: var(--bg); }
.table-note { margin-top: 10px; }
.pickup-field {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--field-border);
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

.pickup-problem { margin-top: 8px; color: var(--danger); }

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
