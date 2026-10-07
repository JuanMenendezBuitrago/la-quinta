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
        @click="chosenCategoryId = category.id"
      >
        {{ category.name }}
      </button>
    </nav>

    <p v-if="loading && !menu.length" class="muted">Cargando la carta…</p>
    <p v-if="error" class="muted" style="color: var(--danger)">No se pudo cargar la carta.</p>
    <p v-if="menu.length && !visibleItems.length" class="muted">Ningún producto coincide con la búsqueda.</p>

    <!-- Cuadricula: un toque en la tarjeta suma una unidad; "−" resta -->
    <ul class="product-grid">
      <li v-for="item in visibleItems" :key="item.id" class="tile" :class="{ selected: quantityOf(item.id) }">
        <button type="button" class="tile-add" :aria-label="`Añadir ${item.name}`" @click="addItem(item)">
          <span class="tile-name">{{ item.name }}</span>
          <span class="tile-price">{{ formatPrice(item.priceCents) }}</span>
        </button>
        <template v-if="quantityOf(item.id)">
          <span class="tile-qty" aria-live="polite">{{ quantityOf(item.id) }}</span>
          <button type="button" class="tile-minus" :aria-label="`Quitar un ${item.name}`" @click="removeOne(item.id)">−</button>
        </template>
      </li>
    </ul>

    <!-- Ticket -->
    <section ref="ticketEl" class="card ticket">
      <h3>Ticket</h3>
      <p v-if="!lines.length" class="muted add-items">Añade productos de la carta.</p>
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
        <li class="ticket-total"><span>Total</span><span>{{ formatPrice(totalCents) }}</span></li>
      </ul>

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
import { orderLinesInput, useCart } from "~/composables/useCart";
import { MENU_QUERY, defaultCartOptions, missingModifiers, type MenuCategory, type MenuItem } from "~/composables/useMenu";
import LineOptionsPicker from "~/components/LineOptionsPicker.vue";
import { type CustomerMatch } from "~/composables/useStaffOrders";
import { BAR_TABLE, TABLES } from "~/composables/useTables";

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
const { lines, add, setQuantity, setOptions, clear, cartCount, totalCents } = useCart("staff-ticket-lines");

const search = ref("");
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
const customer = ref<CustomerMatch | null>(null);
const note = ref("");
const ticketEl = ref<HTMLElement | null>(null);

const submitting = ref(false);
const submitError = ref("");
const lastCode = ref("");

const canSubmit = computed(
  () => !submitting.value && lines.value.length > 0 && !!place.value && !missingChoice.value
);

function reset() {
  clear();
  place.value = "";
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
        items: orderLinesInput(lines.value),
        serviceType: place.value === "LLEVAR" ? "LLEVAR" : "MESA",
        table: place.value === "LLEVAR" ? null : place.value,
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
  border: 1px solid var(--field-border);
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
.ticket .muted.add-items { font-size: 18px; text-align: center;}
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
