<template>
  <!-- Pantallas anchas apaisadas: productos a la izquierda; ticket a la derecha, fijo al hacer scroll -->
  <section class="order-taker wide-layout">
    <div class="wide-main">
    <!-- El texto a la izquierda; los botones, en columna a la derecha -->
    <div v-if="lastCode" class="card sent-notice" role="status">
      <div class="sent-text">
        <p>
          Pedido <strong class="code">{{ lastCode }}</strong>
          {{ lastPaidWith ? `guardado y cobrado (${PAYMENT_LABELS[lastPaidWith].toLowerCase()}).` : "enviado a la cola." }}
        </p>
        <p v-if="printNotice" class="print-notice" role="alert">{{ printNotice }}</p>
      </div>
      <div class="sent-actions">
        <button v-if="ticketPrintingEnabled && lastOrder" class="button" type="button" @click="printLastTicket">
          <Printer :size="16" :stroke-width="1.8" aria-hidden="true" />
          Imprimir ticket
        </button>
        <button class="button secondary" type="button" @click="lastCode = ''">Cerrar</button>
      </div>
    </div>

    <!-- Carta: mismos datos que la carta publica, en formato compacto para teclear rapido -->
    <!-- En movil el buscador va plegado: se abre con la lupa de la fila de categorias -->
    <input
      id="order-search"
      ref="searchInput"
      v-model="search"
      class="search"
      :class="{ 'search--open': searchOpen }"
      type="search"
      placeholder="Buscar producto"
      aria-label="Buscar producto"
    />
    <!-- Atajos a los mas pedidos: un toque suma una unidad, como en la cuadricula -->
    <div v-if="topItems.length && !search.trim()" class="shortcuts" aria-label="Más pedidos">
      <button
        v-for="item in topItems"
        :key="item.id"
        type="button"
        class="shortcut"
        :class="{ selected: quantityOf(item.id) }"
        :aria-label="`Añadir ${item.name}`"
        @click="addItem(item)"
      >
        <span class="shortcut-name">{{ item.name }}</span>
        <span v-if="quantityOf(item.id)" class="shortcut-qty" aria-hidden="true">{{ quantityOf(item.id) }}</span>
      </button>
    </div>
    <div class="category-row">
    <button
      type="button"
      class="search-toggle"
      :class="{ active: searchOpen }"
      :aria-expanded="searchOpen"
      aria-controls="order-search"
      :aria-label="searchOpen ? 'Ocultar búsqueda' : 'Buscar producto'"
      :title="searchOpen ? 'Ocultar búsqueda' : 'Buscar producto'"
      @click="toggleSearch"
    >
      <Search :size="18" :stroke-width="2" aria-hidden="true" />
    </button>
    <nav v-if="!search.trim() && menu.length" class="chips" aria-label="Categorías">
      <button
        v-for="category in menu"
        :key="category.id"
        type="button"
        class="chip"
        :class="{ active: activeCategoryId === category.id }"
        @click="chosenCategoryId = category.id"
      >
        {{ category.name }}
      </button>
    </nav>
    </div>

    <p v-if="loading && !menu.length" class="muted">Cargando la carta…</p>
    <p v-if="error" class="muted" style="color: var(--danger)">No se pudo cargar la carta.</p>
    <EmptyState v-if="menu.length && !visibleItems.length" :icon="SearchX" title="Ningún producto coincide con la búsqueda" />

    <!-- Cuadricula: un toque en la tarjeta suma una unidad; "−" resta -->
    <ul class="product-grid">
      <li v-for="item in visibleItems" :key="item.id" class="tile" :class="{ selected: quantityOf(item.id) }">
        <button type="button" class="tile-add" :aria-label="`Añadir ${item.name}`" @click="addItem(item)">
          <span class="tile-head">
            <span class="tile-name">{{ item.name }}</span>
            <!-- Que se le puede personalizar (p. ej. Adición · Base), para preguntarlo al tomar nota -->
            <span v-if="item.modifiers?.length" class="tile-mods">{{ modifierNames(item) }}</span>
          </span>
          <span class="tile-price">{{ formatPrice(item.priceCents) }}</span>
        </button>
        <template v-if="quantityOf(item.id)">
          <span class="tile-qty" aria-live="polite">{{ quantityOf(item.id) }}</span>
          <button type="button" class="tile-minus" :aria-label="`Quitar un ${item.name}`" @click="removeOne(item.id)">−</button>
        </template>
      </li>
    </ul>

    <!-- Ticket -->
    </div>

    <aside class="wide-aside wide-aside--sticky">
    <section ref="ticketEl" class="card ticket">
      <!-- En cuanto se identifica al cliente, arriba del ticket: se ve de un vistazo para quien es -->
      <div v-if="customer" class="ticket-customer">
        <UserAvatar :avatar="customer.avatar" :name="customer.name" :size="56" />
        <strong>{{ customer.name }}</strong>
        <!-- Que no se olvide ofrecerle el producto gratis: hasta que se aplique el canje. -->
        <div v-if="customer.rewardAvailable && !redeeming" class="reward-alert" role="status">
          <Stamp :size="18" :stroke-width="1.8" aria-hidden="true" />
          <span>Tiene un <strong>canje de sellos</strong> disponible: un producto gratis.</span>
          <button v-if="lines.length" type="button" class="link-button" @click="openDiscounts(true)">Aplicar canje</button>
        </div>
      </div>
      <h3>Ticket</h3>
      <EmptyState v-if="!lines.length" :icon="Receipt" title="El ticket está vacío">Añade productos de la carta.</EmptyState>
      <ul v-else class="ticket-lines">
        <li v-for="line in lines" :key="line.key" class="ticket-line">
          <div class="ticket-line-main">
            <div class="qty">
              <button type="button" class="qty-btn" :aria-label="`Quitar un ${line.name}`" @click="setQuantity(line.key, line.quantity - 1)">−</button>
              <span class="qty-value">{{ line.quantity }}</span>
              <button type="button" class="qty-btn" :aria-label="`Añadir un ${line.name}`" @click="setQuantity(line.key, line.quantity + 1)">+</button>
            </div>
            <span class="ticket-line-name">{{ line.name }}</span>
            <span class="muted">{{ formatPrice(line.priceCents * line.quantity) }}</span>
          </div>
          <LineOptionsPicker
            :modifiers="itemsById.get(line.menuItemId)?.modifiers ?? []"
            :options="line.options"
            @change="setOptions(line.key, $event)"
          />
        </li>
        <li v-if="packagingCents" class="ticket-packaging muted"><span>Empaque (para llevar)</span><span>{{ formatPrice(packagingCents) }}</span></li>
        <li v-if="redeeming" class="ticket-discount">
          <button type="button" class="link-button" title="Cambiar o quitar el canje" @click="openDiscounts()">
            Canje de sellos · {{ redeemLine?.name ?? "elige el producto" }}
          </button>
          <span>− {{ formatPrice(redemptionCents) }}</span>
        </li>
        <li v-if="discount" class="ticket-discount">
          <button type="button" class="link-button" title="Cambiar o quitar el descuento" @click="openDiscounts()">
            Descuento · {{ discountLabel(discount) }}
          </button>
          <span>− {{ formatPrice(discountCents) }}</span>
        </li>
        <li class="ticket-total"><span>Total</span><span>{{ formatPrice(finalCents) }}</span></li>
      </ul>
      <p v-if="discountIssue" class="muted" style="color: var(--danger)">{{ discountIssue }}</p>
      <button v-if="lines.length && !discount && !redeeming" type="button" class="link-button add-discount" @click="openDiscounts()">
        <Percent :size="15" :stroke-width="1.8" aria-hidden="true" />
        Aplicar descuento
      </button>
      <DiscountDialog ref="discountDialog" :gross-cents="grossCents" :lines="lines" :customer="customer" @apply="onDiscount" />

      <div class="field">
        <span class="muted">¿Dónde?</span>
        <div class="places" role="radiogroup" aria-label="Mesa, barra o para llevar">
          <button
            v-for="p in PLACES"
            :key="p.id"
            type="button"
            role="radio"
            :aria-checked="place === p.id"
            :class="{ active: place === p.id, wide: p.id === 'LLEVAR' || p.id === BAR }"
            @click="place = p.id"
          >
            {{ p.label }}
          </button>
        </div>
        <!-- En mesa o barra, pero piden algo para llevar: se empaqueta y lleva el recargo -->
        <label v-if="place && place !== 'LLEVAR'" class="takeaway-check">
          <input v-model="takeaway" type="checkbox" />
          <span>Para llevar</span>
        </label>
      </div>

      <div class="field">
        <span class="muted">Cliente (opcional: para sumar sus sellos)</span>
        <div v-if="customer" class="customer-chip">
          <span><strong>{{ customer.name }}</strong> · <span class="code">{{ customer.customerCode }}</span></span>
          <button class="button secondary" type="button" @click="customer = null">Quitar</button>
        </div>
        <CustomerLookup v-else @found="customer = $event" />
      </div>

      <label class="field">
        <span class="muted">Nota (opcional)</span>
        <input v-model="note" type="text" maxlength="200" placeholder="Ej. sin azúcar, bien caliente" />
      </label>

      <p v-if="missingChoice" class="muted" style="color: var(--danger)">Elige la opción marcada en rojo: la de siempre está agotada.</p>
      <p v-if="submitError" class="muted" style="color: var(--danger)">{{ submitError }}</p>
      <!-- Guardar y pagar: ya se sirvio y se cobra en el acto; el pedido no pasa por la cola -->
      <div v-if="choosingPayment" class="pay-box">
        <span class="muted">Guardar y cobrar {{ formatPrice(finalCents) }} con:</span>
        <div class="pay-methods">
          <button
            v-for="(label, method) in PAYMENT_LABELS"
            :key="method"
            class="button"
            type="button"
            :disabled="!canSubmit"
            @click="method === 'EFECTIVO' ? cashDialog?.open() : submit(method)"
          >
            {{ submitting ? "Guardando…" : label }}
          </button>
        </div>
        <CashChangeDialog ref="cashDialog" :total-cents="finalCents" :busy="submitting" @confirm="payCash" />
        <button class="button secondary" type="button" :disabled="submitting" @click="choosingPayment = false">Volver</button>
      </div>
      <div v-else class="ticket-actions">
        <!-- Lo mas habitual: se sirve y se cobra en el acto; por eso va destacado y primero -->
        <button class="button" type="button" :disabled="!canSubmit" @click="choosingPayment = true">
          <Banknote :size="16" :stroke-width="1.8" aria-hidden="true" />
          Guardar y pagar
        </button>
        <!-- Sin cola nadie lo prepararia: solo se registran pedidos ya servidos y cobrados -->
        <button v-if="queueEnabled" class="button secondary" type="button" :disabled="!canSubmit" @click="submit()">
          {{ submitting ? "Haciendo pedido…" : "Hacer pedido" }}
        </button>
        <button v-if="lines.length" class="button secondary" type="button" :disabled="submitting" @click="reset">Vaciar</button>
      </div>
    </section>
    </aside>

    <!-- Resumen fijo: con la lista larga, el ticket queda lejos (en el diseño ancho no hace falta) -->
    <div v-if="cartCount" class="sticky-bar">
      <span>{{ cartCount }} {{ cartCount === 1 ? "producto" : "productos" }} · {{ formatPrice(finalCents) }}</span>
      <button class="button" type="button" @click="ticketEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })">Ver ticket</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Banknote, Percent, Printer, Receipt, Search, SearchX, Stamp } from "lucide-vue-next";
import { useTicketPrinter } from "~/composables/useTicketPrinter";
import EmptyState from "~/components/EmptyState.vue";
import { gql } from "graphql-tag";
import { orderLinesInput, useCart } from "~/composables/useCart";
import { MENU_QUERY, defaultCartOptions, missingModifiers, type MenuCategory, type MenuItem } from "~/composables/useMenu";
import CashChangeDialog from "~/components/CashChangeDialog.vue";
import DiscountDialog from "~/components/DiscountDialog.vue";
import { useStaffAuth } from "~/composables/useAuth";
import LineOptionsPicker from "~/components/LineOptionsPicker.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import { useOrderQueueEnabled, usePackagingFee } from "~/composables/useSiteSettings";
import {
  ORDER_FIELDS,
  PAYMENT_LABELS,
  discountAmount,
  discountLabel,
  discountProblem,
  redemptionAmount,
  redemptionProblem,
  type CustomerMatch,
  type DiscountInput,
  type OrderDiscounts,
  type RedemptionInput,
  type PaymentMethod,
} from "~/composables/useStaffOrders";
import { BAR_TABLE, TABLES } from "~/composables/useTables";

const TOP_MENU_ITEMS = gql`
  query TopMenuItems($limit: Int) {
    topMenuItems(limit: $limit)
  }
`;
// Se piden algunos de mas: los borrados o no disponibles no estan en la carta y se descartan.
const SHORTCUT_COUNT = 5;

const CREATE_STAFF_ORDER = gql`
  mutation CreateStaffOrder($input: StaffOrderInput!) {
    createStaffOrder(input: $input) {
      ${ORDER_FIELDS}
    }
  }
`;

const { result, loading, error } = useQuery<{ menu: MenuCategory[] }>(MENU_QUERY);
const menu = computed(() => result.value?.menu ?? []);

// Ticket propio: no se mezcla con el carrito publico aunque sea el mismo navegador.
const { lines, add, setQuantity, setOptions, clear, cartCount, totalCents } = useCart("staff-ticket-lines");

const search = ref("");
const searchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);

// Al cerrar el buscador se borra lo escrito: si no, la carta seguiria filtrada sin que se vea por que.
async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    await nextTick();
    searchInput.value?.focus();
  } else {
    search.value = "";
  }
}
// Calculada (no asignada al cargar): asi el servidor ya pinta la primera categoria marcada y la
// hidratacion no deja la clase "active" desincronizada.
const chosenCategoryId = ref<string | null>(null);
const activeCategoryId = computed(() =>
  menu.value.some((c) => c.id === chosenCategoryId.value) ? chosenCategoryId.value : menu.value[0]?.id ?? null
);

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Con busqueda, en toda la carta (sin tildes ni mayusculas); sin ella, la categoria elegida.
const visibleItems = computed<MenuItem[]>(() => {
  const q = normalize(search.value.trim());
  if (q) return menu.value.flatMap((c) => c.items).filter((i) => normalize(i.name).includes(q));
  return menu.value.find((c) => c.id === activeCategoryId.value)?.items ?? [];
});

const itemsById = computed(() => new Map(menu.value.flatMap((c) => c.items).map((i) => [i.id, i])));

const { result: topResult } = useQuery<{ topMenuItems: string[] }>(TOP_MENU_ITEMS, { limit: SHORTCUT_COUNT + 5 });
const topItems = computed(() =>
  (topResult.value?.topMenuItems ?? [])
    .map((id) => itemsById.value.get(id))
    .filter((i): i is MenuItem => !!i)
    .slice(0, SHORTCUT_COUNT)
);

function modifierNames(item: MenuItem) {
  return (item.modifiers ?? []).map((m) => m.group.name).join(" · ");
}

function quantityOf(menuItemId: string) {
  return lines.value.filter((l) => l.menuItemId === menuItemId).reduce((sum, l) => sum + l.quantity, 0);
}
function addItem(item: MenuItem) {
  add({ id: item.id, name: item.name, priceCents: item.priceCents }, defaultCartOptions(item));
}
// El "−" de la tarjeta quita primero de la linea sin personalizar; si no la hay, de la ultima.
function removeOne(menuItemId: string) {
  const itemLines = lines.value.filter((l) => l.menuItemId === menuItemId);
  const line = itemLines.find((l) => l.options.every((o) => o.isDefault)) ?? itemLines[itemLines.length - 1];
  if (line) setQuantity(line.key, line.quantity - 1);
}

// Lineas con una personalizacion obligatoria sin elegir (su opcion por defecto esta agotada).
const missingChoice = computed(() =>
  lines.value.some((l) => missingModifiers(itemsById.value.get(l.menuItemId)?.modifiers, l.options).length)
);

// Las mesas y la barra (que se guarda como servicio en mesa con table = "Barra"), o para llevar.
const BAR = BAR_TABLE;
const PLACES = [...TABLES, { id: "LLEVAR", label: "Para llevar" }];
// Sin valor por defecto: obliga a elegir, para que ningun pedido acabe en la mesa equivocada.
const place = ref("");
// Lo que mostrara el pedido al crearlo (lo calcula la API): solo en "Para llevar".
const packagingFee = usePackagingFee();
const queueEnabled = useOrderQueueEnabled();
const takeaway = ref(false);
const isTakeaway = computed(() => place.value === "LLEVAR" || (!!place.value && takeaway.value));
const packagingCents = computed(() => (isTakeaway.value ? packagingFee.value : 0));
const customer = ref<CustomerMatch | null>(null);
const note = ref("");

// Canje de sellos y descuento del ticket. El canje sigue al producto (su linea, por key) aunque
// cambie el orden del ticket; si se quita ese producto, no deja enviar hasta que se elija otro.
// El descuento va sobre lo que queda tras el canje y se recalcula si cambian los productos (un 10 %
// sigue siendo un 10 %); si deja de valer (p. ej. un importe fijo mayor), tampoco deja enviar.
const { staff } = useStaffAuth();
const redeeming = ref(false);
const redeemLineKey = ref<string | null>(null);
const discount = ref<DiscountInput | null>(null);
const discountDialog = ref<InstanceType<typeof DiscountDialog> | null>(null);
const grossCents = computed(() => totalCents.value + packagingCents.value);
const redemption = computed<RedemptionInput | null>(() => {
  if (!redeeming.value) return null;
  const lineIndex = lines.value.findIndex((l) => l.key === redeemLineKey.value);
  return { lineIndex: lineIndex === -1 ? null : lineIndex };
});
const redeemLine = computed(() => lines.value.find((l) => l.key === redeemLineKey.value) ?? null);
const redemptionCents = computed(() => (redemption.value ? redemptionAmount(redemption.value, lines.value) : 0));
const baseCents = computed(() => Math.max(grossCents.value - redemptionCents.value, 0));
const discountCents = computed(() => (discount.value ? discountAmount(discount.value, baseCents.value) : 0));
const finalCents = computed(() => Math.max(baseCents.value - discountCents.value, 0));
const discountIssue = computed(() => {
  if (!lines.value.length) return null;
  if (redemption.value) {
    if (!customer.value) return "Para canjear sellos, identifica al cliente";
    if (!redeemLine.value) return "El producto del canje ya no está en el ticket: elige otro";
    const problem = redemptionProblem(redemption.value, lines.value);
    if (problem) return problem;
  }
  return discount.value ? discountProblem(discount.value, baseCents.value, staff.value?.role) : null;
});
function openDiscounts(withRedeem = false) {
  discountDialog.value?.open({ redemption: redemption.value, discount: discount.value }, withRedeem);
}
function onDiscount(value: OrderDiscounts) {
  redeeming.value = !!value.redemption;
  redeemLineKey.value = value.redemption ? lines.value[value.redemption.lineIndex ?? -1]?.key ?? null : null;
  discount.value = value.discount;
  discountDialog.value?.close();
}
const ticketEl = ref<HTMLElement | null>(null);

const submitting = ref(false);
const submitError = ref("");
const lastCode = ref("");
const lastPaidWith = ref<PaymentMethod | null>(null);
// El ultimo pedido guardado, para imprimir su ticket desde el aviso (sin pasar por la cola).
const lastOrder = ref<any>(null);
const { enabled: ticketPrintingEnabled, printTicket } = useTicketPrinter();
const printNotice = ref("");
async function printLastTicket() {
  if (lastOrder.value) printNotice.value = (await printTicket(lastOrder.value)) ?? "";
}
const choosingPayment = ref(false);

const canSubmit = computed(
  () => !submitting.value && lines.value.length > 0 && !!place.value && !missingChoice.value && !discountIssue.value
);

function reset() {
  clear();
  place.value = "";
  takeaway.value = false;
  customer.value = null;
  note.value = "";
  discount.value = null;
  redeeming.value = false;
  redeemLineKey.value = null;
  search.value = "";
  choosingPayment.value = false;
}

// Efectivo: antes, el modal calcula el cambio; al confirmar se guarda y se cierra (si falla, el error sale en el ticket).
const cashDialog = ref<InstanceType<typeof CashChangeDialog> | null>(null);
async function payCash(cashReceivedCents: number) {
  await submit("EFECTIVO", cashReceivedCents);
  cashDialog.value?.close();
}

// Con metodo de pago: guardar y pagar (nace entregado y cobrado).
// cashReceivedCents: en efectivo, lo que entrego el cliente (si se anoto en el modal).
async function submit(paymentMethod: PaymentMethod | null = null, cashReceivedCents: number | null = null) {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = "";
  try {
    const { mutate } = useMutation(CREATE_STAFF_ORDER);
    const res = await mutate({
      input: {
        items: orderLinesInput(lines.value),
        serviceType: place.value === "LLEVAR" ? "LLEVAR" : "MESA",
        table: place.value === "LLEVAR" ? null : place.value,
        takeaway: isTakeaway.value,
        customerId: customer.value?.id ?? null,
        note: note.value.trim() || null,
        paymentMethod,
        cashReceivedCents,
        redemption: redemption.value,
        discount: discount.value,
      },
    });
    lastCode.value = res?.data?.createStaffOrder.code ?? "";
    lastOrder.value = res?.data?.createStaffOrder ?? null;
    printNotice.value = "";
    lastPaidWith.value = paymentMethod;
    reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err: any) {
    submitError.value = err?.message ?? "No se pudo enviar el pedido";
  } finally {
    submitting.value = false;
  }
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.order-taker { max-width: 720px; padding-bottom: 72px; }
.order-taker .wide-main { gap: 0; }
@media (min-width: 1000px) and (orientation: landscape) {
  .order-taker { max-width: none; padding-bottom: 0; }
}
input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.code { font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0.06em; color: var(--accent); }

.sent-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; border-color: var(--accent); }
.sent-text { min-width: 0; }
.sent-text p { margin: 0; }
.print-notice { margin-top: 6px !important; color: var(--danger); font-size: 14px; }
/* Botones uno debajo de otro, del mismo ancho, pegados al borde derecho */
.sent-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; flex-shrink: 0; }

.search { display: none; margin-bottom: 10px; }
.shortcuts { display: flex; gap: 6px; overflow-x: auto; padding: 6px 6px 8px 0; margin-bottom: 4px; }
.shortcut {
  position: relative;
  flex-shrink: 0;
  max-width: 160px;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease;
}
.shortcut:active { transform: scale(0.97); }
.shortcut.selected { background: var(--accent); color: var(--bg); }
.shortcut-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shortcut-qty {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--accent);
  border: 1px solid var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search.search--open { display: block; }
.category-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
.search-toggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.search-toggle.active { border-color: var(--accent); color: var(--accent); }
.search-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; min-width: 0; }
/* Pantalla ancha: buscador siempre visible, sin lupa */
@media (min-width: 1000px) and (orientation: landscape) {
  .search { display: block; }
  .search-toggle { display: none; }
}
.chip {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }

.product-grid {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px;
}
.tile { position: relative; min-width: 0; }
.tile-add {
  width: 100%;
  height: 100%;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 10px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.12s ease, transform 0.08s ease;
}
.tile-add:active { transform: scale(0.97); }
.tile.selected .tile-add { border: 2px solid var(--accent); padding: 9px 9px 7px; }
.tile-name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tile-head { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tile-mods { font-size: 12px; line-height: 1.25; color: var(--accent); overflow-wrap: anywhere; }
/* Con unidades, el "−" ocupa la esquina inferior derecha: que no tape las personalizaciones */
.tile.selected .tile-mods { padding-right: 30px; }
.tile-price { font-size: 12.5px; color: var(--text-muted); }
.tile-qty {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.tile-minus {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--bg);
  color: var(--accent);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.ticket { display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 80px; }
.ticket h3 { text-transform: uppercase; margin: 0; }
.ticket-lines { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.ticket-lines li { display: flex; justify-content: space-between; gap: 12px; }
.ticket-lines li.ticket-line { flex-direction: column; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.ticket-line-main { display: flex; align-items: center; gap: 10px; }
.ticket-line-name { flex: 1; min-width: 0; font-weight: 600; }
.qty { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.qty-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
.qty-value { min-width: 18px; text-align: center; font-variant-numeric: tabular-nums; }

.ticket-lines li.ticket-discount { align-items: baseline; color: var(--accent); }
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; text-align: left; cursor: pointer; }
.add-discount { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; }
.ticket-total { border-top: 1px solid var(--border); padding-top: 6px; font-weight: 700; }
.field { display: flex; flex-direction: column; gap: 6px; }
/* Botones grandes: 3 mesas por fila en movil; barra y para llevar ocupan media fila cada uno */
.places { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.places button {
  grid-column: span 2;
  min-height: 48px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.places button.wide { grid-column: span 3; }
.places button.active { background: var(--accent); color: var(--bg); }
.ticket-customer { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.ticket-customer strong { font-size: 17px; overflow-wrap: anywhere; }
.reward-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 8px;
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  font-size: 14px;
}
.reward-alert strong { font-size: inherit; }
.reward-alert svg { flex-shrink: 0; color: var(--accent); }
.takeaway-check { display: inline-flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 15px; font-weight: 600; cursor: pointer; align-self: flex-start; }
.takeaway-check input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
.customer-chip { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ticket-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pay-box { display: flex; flex-direction: column; gap: 8px; }
.pay-methods { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.pay-methods .button { min-height: 44px; }

.sticky-bar {
  position: fixed;
  left: 0;
  right: 0;
  /* Encima de la barra inferior del personal */
  bottom: var(--quickbar-height, 0px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg);
  border-top: 1px solid var(--border-strong);
  z-index: 10;
}
/* Diseño ancho: el ticket ya esta siempre a la vista (columna fija), sobra la barra "Ver ticket" */
@media (min-width: 1000px) and (orientation: landscape) { .sticky-bar { display: none; } }
/* Movil: dos columnas, tarjetas mas anchas para leer el nombre entero y acertar con el dedo */
@media (max-width: 600px) {
  .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .tile-add { min-height: 84px; padding: 12px 12px 10px; }
  .tile.selected .tile-add { padding: 11px 11px 9px; }
  .tile-name { font-size: 15px; }
  .tile-mods { font-size: 13px; }
  .tile-price { font-size: 13.5px; }
}
/* Diseño ancho: tarjetas de producto mas grandes, en tres columnas */
@media (min-width: 1000px) and (orientation: landscape) {
  .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .tile-add { min-height: 104px; padding: 14px 14px 12px; gap: 10px; }
  .tile.selected .tile-add { padding: 13px 13px 11px; }
  .tile-name { font-size: 17px; }
  .tile-mods { font-size: 14px; }
  .tile-price { font-size: 15px; }
  .tile-qty { min-width: 28px; height: 28px; font-size: 15px; }
}
</style>
