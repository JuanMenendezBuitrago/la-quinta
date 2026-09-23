<template>
  <section class="order-taker">
    <p v-if="lastCode" class="card sent-notice" role="status">
      Pedido <strong class="code">{{ lastCode }}</strong> enviado a la cola.
      <button class="button secondary" type="button" @click="lastCode = ''">Cerrar</button>
    </p>

    <!-- Carta: mismos datos que la carta publica, en formato compacto para teclear rapido -->
    <input v-model="search" class="search" type="search" placeholder="Buscar producto" aria-label="Buscar producto" />
    <nav v-if="!search.trim() && menu.length" class="chips" aria-label="Categorías">
      <button
        v-for="category in menu"
        :key="category.id"
        type="button"
        class="chip"
        :class="{ active: activeCategoryId === category.id }"
        @click="activeCategoryId = category.id"
      >
        {{ category.name }}
      </button>
    </nav>

    <p v-if="loading && !menu.length" class="muted">Cargando la carta…</p>
    <p v-if="error" class="muted" style="color: var(--danger)">No se pudo cargar la carta.</p>
    <p v-if="menu.length && !visibleItems.length" class="muted">Ningún producto coincide con la búsqueda.</p>

    <ul class="product-list">
      <li v-for="item in visibleItems" :key="item.id" class="product-row">
        <div class="product-info">
          <span class="product-name">{{ item.name }}</span>
          <span class="muted">{{ formatPrice(item.priceCents) }}</span>
        </div>
        <div class="qty">
          <template v-if="quantityOf(item.id)">
            <button type="button" class="qty-btn" :aria-label="`Quitar un ${item.name}`" @click="setQuantity(item.id, quantityOf(item.id) - 1)">−</button>
            <span class="qty-value">{{ quantityOf(item.id) }}</span>
          </template>
          <button type="button" class="qty-btn add" :aria-label="`Añadir ${item.name}`" @click="addItem(item)">+</button>
        </div>
      </li>
    </ul>

    <!-- Ticket -->
    <section ref="ticketEl" class="card ticket">
      <h3>Ticket</h3>
      <p v-if="!lines.length" class="muted">Añade productos de la carta.</p>
      <ul v-else class="ticket-lines">
        <li v-for="line in lines" :key="line.menuItemId">
          <span>{{ line.quantity }}× {{ line.name }}</span>
          <span class="muted">{{ formatPrice(line.priceCents * line.quantity) }}</span>
        </li>
        <li class="ticket-total"><span>Total</span><span>{{ formatPrice(totalCents) }}</span></li>
      </ul>

      <div class="field">
        <span class="muted">Servicio</span>
        <div class="segmented" role="radiogroup" aria-label="Servicio">
          <button type="button" role="radio" :aria-checked="serviceType === 'MESA'" :class="{ active: serviceType === 'MESA' }" @click="serviceType = 'MESA'">Mesa</button>
          <button type="button" role="radio" :aria-checked="serviceType === 'LLEVAR'" :class="{ active: serviceType === 'LLEVAR' }" @click="serviceType = 'LLEVAR'">Para llevar</button>
        </div>
        <input v-if="serviceType === 'MESA'" v-model="table" type="text" inputmode="numeric" maxlength="20" placeholder="Número de mesa" aria-label="Número de mesa" />
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
        <input v-model="note" type="text" maxlength="200" placeholder="Ej. sin azúcar, leche de avena" />
      </label>

      <p v-if="submitError" class="muted" style="color: var(--danger)">{{ submitError }}</p>
      <div class="ticket-actions">
        <button class="button" type="button" :disabled="!canSubmit" @click="submit">
          {{ submitting ? "Enviando…" : "Enviar a cola" }}
        </button>
        <button v-if="lines.length" class="button secondary" type="button" :disabled="submitting" @click="reset">Vaciar</button>
      </div>
    </section>

    <!-- Resumen fijo: con la lista larga, el ticket queda lejos -->
    <div v-if="cartCount" class="sticky-bar">
      <span>{{ cartCount }} {{ cartCount === 1 ? "producto" : "productos" }} · {{ formatPrice(totalCents) }}</span>
      <button class="button" type="button" @click="ticketEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })">Ver ticket</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useCart } from "~/composables/useCart";
import { MENU_QUERY, type MenuCategory, type MenuItem } from "~/composables/useMenu";
import type { CustomerMatch } from "~/composables/useStaffOrders";

const CREATE_STAFF_ORDER = gql`
  mutation CreateStaffOrder($input: StaffOrderInput!) {
    createStaffOrder(input: $input) {
      id
      code
    }
  }
`;

const { result, loading, error } = useQuery<{ menu: MenuCategory[] }>(MENU_QUERY);
const menu = computed(() => result.value?.menu ?? []);

// Ticket propio: no se mezcla con el carrito publico aunque sea el mismo navegador.
const { lines, add, setQuantity, clear, cartCount, totalCents } = useCart("staff-ticket-lines");

const search = ref("");
const activeCategoryId = ref<string | null>(null);
watch(
  menu,
  (val) => {
    if (val.length && !val.some((c) => c.id === activeCategoryId.value)) activeCategoryId.value = val[0].id;
  },
  { immediate: true }
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

function quantityOf(menuItemId: string) {
  return lines.value.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0;
}
function addItem(item: MenuItem) {
  add({ id: item.id, name: item.name, priceCents: item.priceCents });
}

const serviceType = ref<"MESA" | "LLEVAR">("MESA");
const table = ref("");
const customer = ref<CustomerMatch | null>(null);
const note = ref("");
const ticketEl = ref<HTMLElement | null>(null);

const submitting = ref(false);
const submitError = ref("");
const lastCode = ref("");

const canSubmit = computed(
  () => !submitting.value && lines.value.length > 0 && (serviceType.value !== "MESA" || !!table.value.trim())
);

function reset() {
  clear();
  table.value = "";
  customer.value = null;
  note.value = "";
  search.value = "";
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = "";
  try {
    const { mutate } = useMutation(CREATE_STAFF_ORDER);
    const res = await mutate({
      input: {
        items: lines.value.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        serviceType: serviceType.value,
        table: serviceType.value === "MESA" ? table.value.trim() : null,
        customerId: customer.value?.id ?? null,
        note: note.value.trim() || null,
      },
    });
    lastCode.value = res?.data?.createStaffOrder.code ?? "";
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
input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}
.code { font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0.06em; color: var(--accent); }

.sent-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; border-color: var(--accent); }

.search { margin-bottom: 10px; }
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 6px; }
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

.product-list { list-style: none; padding: 0; margin: 0 0 20px; }
.product-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.product-info { display: flex; flex-direction: column; min-width: 0; }
.product-name { font-weight: 600; overflow-wrap: anywhere; }
.qty { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.qty-value { min-width: 1.5em; text-align: center; font-weight: 700; }
/* Botones grandes: se usan de pie y con prisa */
.qty-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.qty-btn.add { background: var(--accent); color: var(--bg); }

.ticket { display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 80px; }
.ticket h3 { margin: 0; }
.ticket-lines { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.ticket-lines li { display: flex; justify-content: space-between; gap: 12px; }
.ticket-total { border-top: 1px solid var(--border); padding-top: 6px; font-weight: 700; }
.field { display: flex; flex-direction: column; gap: 6px; }
.segmented { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--accent); border-radius: 8px; overflow: hidden; }
.segmented button { border: none; background: transparent; color: var(--accent); padding: 10px; font: inherit; font-weight: 600; cursor: pointer; }
.segmented button.active { background: var(--accent); color: var(--bg); }
.customer-chip { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ticket-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.sticky-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg);
  border-top: 1px solid var(--border-strong);
  z-index: 10;
}
</style>
