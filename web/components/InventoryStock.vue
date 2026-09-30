<template>
  <div class="stock-view">
    <div class="toolbar">
      <input v-model="search" class="search" type="search" placeholder="Buscar insumo" aria-label="Buscar insumo" />
      <button v-if="isGestion && !creating" class="button" type="button" @click="startCreate">Nuevo insumo</button>
    </div>

    <!-- Alta de insumo (gestion) -->
    <form v-if="creating" class="card supply-form" @submit.prevent="saveNew">
      <h3>Nuevo insumo</h3>
      <SupplyFields v-model="form" :categories="categories" />
      <label class="field">
        <span class="muted">Stock actual (opcional)</span>
        <QtyInput v-model="initialStock" :unit="form.unit" aria-label="Stock actual" />
      </label>
      <p v-if="formError" class="error">{{ formError }}</p>
      <div class="actions">
        <button class="button" type="submit" :disabled="saving">{{ saving ? "Guardando…" : "Crear" }}</button>
        <button class="button secondary" type="button" @click="creating = false">Cancelar</button>
      </div>
    </form>

    <p v-if="loading && !supplies.length" class="muted">Cargando inventario…</p>
    <p v-else-if="!supplies.length" class="muted">
      Todavía no hay insumos.{{ isGestion ? " Crea el primero con «Nuevo insumo»." : " Gestión debe darlos de alta." }}
    </p>
    <p v-else-if="!groups.length" class="muted">Ningún insumo coincide con la búsqueda.</p>

    <section v-for="group in groups" :key="group.title" class="group">
      <h3 :class="{ 'low-title': group.low }">{{ group.title }} ({{ group.items.length }})</h3>
      <ul class="supply-list">
        <li v-for="supply in group.items" :key="supply.id" class="supply-row" :class="{ low: supply.low && supply.active, inactive: !supply.active }">
          <div class="supply-main">
            <button type="button" class="supply-name" :aria-expanded="isOpen(supply, 'historial')" @click="toggle(supply, 'historial')">
              {{ supply.name }}
            </button>
            <span class="supply-qty">
              <strong>{{ formatQty(supply.stock, supply.unit) }}</strong>
              <span class="muted"> · mín. {{ formatQty(supply.minStock, supply.unit) }}</span>
            </span>
          </div>
          <div class="row-actions">
            <template v-if="supply.active">
              <button type="button" class="button secondary small" @click="toggle(supply, 'entrada')">Entrada</button>
              <button type="button" class="button secondary small" @click="toggle(supply, 'merma')">Merma</button>
            </template>
            <template v-if="isGestion">
              <button v-if="supply.active" type="button" class="button secondary small" @click="toggle(supply, 'ajuste')">Ajuste</button>
              <button type="button" class="button secondary small" @click="toggle(supply, 'editar')">Editar</button>
            </template>
          </div>

          <!-- Entrada / merma / ajuste -->
          <form v-if="openId === supply.id && ['entrada', 'merma', 'ajuste'].includes(mode)" class="panel" @submit.prevent="saveMovement(supply)">
            <label class="field">
              <span class="muted">{{ movementLabel }}</span>
              <QtyInput v-model="qty" :unit="supply.unit" :allow-negative="mode === 'ajuste'" :placeholder="mode === 'ajuste' ? 'Ej. -250 o 250' : '0'" :aria-label="movementLabel" />
            </label>
            <label class="field">
              <span class="muted">{{ mode === "entrada" ? "Nota (opcional: proveedor, factura…)" : "Motivo" }}</span>
              <input v-model="note" type="text" maxlength="200" :placeholder="mode === 'merma' ? 'Ej. leche cortada, vaso roto' : ''" />
            </label>
            <p v-if="panelError" class="error">{{ panelError }}</p>
            <div class="actions">
              <button class="button" type="submit" :disabled="saving || !canSaveMovement">{{ saving ? "Guardando…" : "Guardar" }}</button>
              <button class="button secondary" type="button" @click="close">Cancelar</button>
            </div>
          </form>

          <!-- Editar (gestion) -->
          <form v-else-if="openId === supply.id && mode === 'editar'" class="panel" @submit.prevent="saveEdit(supply)">
            <SupplyFields v-model="form" :categories="categories" />
            <p v-if="panelError" class="error">{{ panelError }}</p>
            <div class="actions">
              <button class="button" type="submit" :disabled="saving">{{ saving ? "Guardando…" : "Guardar" }}</button>
              <button class="button secondary" type="button" @click="close">Cancelar</button>
              <button class="button secondary push" type="button" :disabled="saving" @click="toggleActive(supply)">
                {{ supply.active ? "Desactivar" : "Activar" }}
              </button>
              <button class="button secondary danger" type="button" :disabled="saving" @click="remove(supply)">Borrar</button>
            </div>
          </form>

          <!-- Historial -->
          <div v-else-if="openId === supply.id && mode === 'historial'" class="panel">
            <p v-if="movementsLoading && !movements.length" class="muted">Cargando movimientos…</p>
            <p v-else-if="!movements.length" class="muted">Sin movimientos todavía.</p>
            <ul class="movements">
              <li v-for="m in movements" :key="m.id">
                <span class="mv-delta" :class="{ neg: m.delta < 0 }">{{ formatDelta(m.delta, supply.unit) }}</span>
                <span class="mv-info">
                  <strong>{{ REASON_LABELS[m.reason] }}</strong>
                  <template v-if="m.reason === 'conteo' && m.countedQty !== null"> · contado {{ formatQty(m.countedQty, supply.unit) }}</template>
                  <template v-if="m.orderCode"> · pedido <span class="code">{{ m.orderCode }}</span></template>
                  <template v-if="m.note"> · {{ m.note }}</template>
                  <span class="muted mv-meta">{{ formatDateTime(m.createdAt) }}{{ m.staffName ? ` · ${m.staffName}` : "" }}</span>
                </span>
              </li>
            </ul>
            <button v-if="hasMoreMovements" class="button secondary small" type="button" :disabled="movementsLoading" @click="loadMovements(supply, true)">
              Ver más
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  ADJUST_STOCK,
  CREATE_SUPPLY,
  DELETE_SUPPLY,
  formatDelta,
  formatQty,
  REASON_LABELS,
  RECORD_ENTRY,
  RECORD_WASTE,
  SET_SUPPLY_ACTIVE,
  SUPPLIES_QUERY,
  SUPPLY_MOVEMENTS_QUERY,
  UPDATE_SUPPLY,
  type StockMovement,
  type Supply,
  type SupplyForm,
} from "~/composables/useInventory";
import { useStoreTime } from "~/composables/useStoreTime";
import QtyInput from "~/components/QtyInput.vue";
import SupplyFields from "~/components/SupplyFields.vue";

const props = defineProps<{ isGestion: boolean }>();
const { formatDateTime } = useStoreTime();

const { result, loading, refetch } = useQuery<{ supplies: Supply[] }>(SUPPLIES_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));
const supplies = computed(() => result.value?.supplies ?? []);
const categories = computed(() => [...new Set(supplies.value.map((s) => s.category).filter(Boolean))].sort());

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Primero lo que esta bajo minimo; luego por categoria; los desactivados al final (solo gestion).
const groups = computed(() => {
  const q = normalize(search.value.trim());
  const visible = supplies.value.filter(
    (s) => (s.active || props.isGestion) && (!q || normalize(s.name).includes(q))
  );
  const low = visible.filter((s) => s.active && s.low);
  const byCategory = new Map<string, Supply[]>();
  for (const s of visible) {
    if (!s.active || s.low) continue;
    const key = s.category || "Sin categoría";
    byCategory.set(key, [...(byCategory.get(key) ?? []), s]);
  }
  const inactive = visible.filter((s) => !s.active);
  return [
    ...(low.length ? [{ title: "Bajo mínimo", items: low, low: true }] : []),
    ...[...byCategory.entries()].map(([title, items]) => ({ title, items, low: false })),
    ...(inactive.length ? [{ title: "Desactivados", items: inactive, low: false }] : []),
  ];
});

const search = ref("");
const saving = ref(false);

// --- Alta ---
const emptyForm = (): SupplyForm => ({ name: "", unit: "g", category: "", minStock: 0 });
const creating = ref(false);
const form = ref<SupplyForm>(emptyForm());
const initialStock = ref<number | null>(null);
const formError = ref("");
const { mutate: createSupply } = useMutation(CREATE_SUPPLY);

function startCreate() {
  close();
  form.value = emptyForm();
  initialStock.value = null;
  formError.value = "";
  creating.value = true;
}

function supplyInput() {
  if (form.value.minStock === null) throw new Error("Indica el stock mínimo (0 si no quieres aviso)");
  return { name: form.value.name, unit: form.value.unit, category: form.value.category, minStock: form.value.minStock };
}

async function saveNew() {
  saving.value = true;
  formError.value = "";
  try {
    await createSupply({ input: supplyInput(), initialStock: initialStock.value });
    creating.value = false;
    await refetch();
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo crear el insumo";
  } finally {
    saving.value = false;
  }
}

// --- Paneles por fila (uno abierto a la vez) ---
type Mode = "entrada" | "merma" | "ajuste" | "editar" | "historial";
const openId = ref("");
const mode = ref<Mode>("entrada");
const qty = ref<number | null>(null);
const note = ref("");
const panelError = ref("");

function isOpen(supply: Supply, m: Mode) {
  return openId.value === supply.id && mode.value === m;
}
function close() {
  openId.value = "";
  panelError.value = "";
}
function toggle(supply: Supply, m: Mode) {
  if (isOpen(supply, m)) return close();
  creating.value = false;
  openId.value = supply.id;
  mode.value = m;
  qty.value = null;
  note.value = "";
  panelError.value = "";
  if (m === "editar") {
    form.value = { name: supply.name, unit: supply.unit, category: supply.category, minStock: supply.minStock };
  }
  if (m === "historial") loadMovements(supply, false);
}

const movementLabel = computed(() =>
  mode.value === "entrada" ? "Cantidad que entra" : mode.value === "merma" ? "Cantidad perdida" : "Corrección (negativa para restar)"
);
const canSaveMovement = computed(() => {
  if (qty.value === null) return false;
  if (mode.value === "ajuste") return qty.value !== 0 && !!note.value.trim();
  if (mode.value === "merma") return qty.value > 0 && !!note.value.trim();
  return qty.value > 0;
});

const { mutate: recordEntry } = useMutation(RECORD_ENTRY);
const { mutate: recordWaste } = useMutation(RECORD_WASTE);
const { mutate: adjustStock } = useMutation(ADJUST_STOCK);

async function saveMovement(supply: Supply) {
  if (!canSaveMovement.value || qty.value === null) return;
  saving.value = true;
  panelError.value = "";
  try {
    const noteValue = note.value.trim();
    if (mode.value === "entrada") await recordEntry({ supplyId: supply.id, qty: qty.value, note: noteValue || null });
    else if (mode.value === "merma") await recordWaste({ supplyId: supply.id, qty: qty.value, note: noteValue });
    else await adjustStock({ supplyId: supply.id, delta: qty.value, note: noteValue });
    close();
  } catch (err: any) {
    panelError.value = err?.message ?? "No se pudo guardar";
  } finally {
    saving.value = false;
  }
}

// --- Edicion (gestion) ---
const { mutate: updateSupply } = useMutation(UPDATE_SUPPLY);
const { mutate: setActive } = useMutation(SET_SUPPLY_ACTIVE);
const { mutate: deleteSupply } = useMutation(DELETE_SUPPLY);

async function runPanel(action: () => Promise<unknown>, fallback: string) {
  saving.value = true;
  panelError.value = "";
  try {
    await action();
    close();
  } catch (err: any) {
    panelError.value = err?.message ?? fallback;
  } finally {
    saving.value = false;
  }
}
function saveEdit(supply: Supply) {
  return runPanel(() => updateSupply({ id: supply.id, input: supplyInput() }), "No se pudo guardar el insumo");
}
function toggleActive(supply: Supply) {
  return runPanel(() => setActive({ id: supply.id, active: !supply.active }), "No se pudo cambiar el estado");
}
function remove(supply: Supply) {
  return runPanel(async () => {
    await deleteSupply({ id: supply.id });
    await refetch();
  }, "No se pudo borrar el insumo");
}

// --- Historial ---
const PAGE = 20;
const movements = ref<StockMovement[]>([]);
const movementsLoading = ref(false);
const hasMoreMovements = ref(false);

async function loadMovements(supply: Supply, more: boolean) {
  movementsLoading.value = true;
  if (!more) movements.value = [];
  try {
    const { data } = await useNuxtApp().$apollo.defaultClient.query({
      query: SUPPLY_MOVEMENTS_QUERY,
      variables: { supplyId: supply.id, limit: PAGE, offset: more ? movements.value.length : 0 },
      fetchPolicy: "network-only",
    });
    const page: StockMovement[] = data.supplyMovements;
    movements.value = [...movements.value, ...page];
    hasMoreMovements.value = page.length === PAGE;
  } catch (err: any) {
    panelError.value = err?.message ?? "No se pudo cargar el historial";
  } finally {
    movementsLoading.value = false;
  }
}
</script>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
.search, .field input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.toolbar .button { flex-shrink: 0; }
.supply-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
.supply-form h3 { margin: 0; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.error { color: var(--danger); margin: 0; font-size: 14px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions .push { margin-left: auto; }
.danger { color: var(--danger); border-color: var(--danger); }

.group { margin-bottom: 20px; }
.group h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 6px; }
.group h3.low-title { color: var(--danger); }
.supply-list { list-style: none; padding: 0; margin: 0; }
.supply-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 10px 0 10px 10px;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
}
.supply-row.low { border-left-color: var(--danger); }
.supply-row.low .supply-qty strong { color: var(--danger); }
.supply-row.inactive { opacity: 0.6; }
.supply-main { display: flex; flex-direction: column; min-width: 0; flex: 1 1 180px; }
.supply-name {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.supply-name:hover { color: var(--accent); }
.supply-qty { font-size: 14px; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.button.small { padding: 6px 10px; font-size: 13px; min-height: 36px; }

.panel { flex-basis: 100%; display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 4px 0; }
.movements { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.movements li { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 10px; font-size: 14px; }
.mv-delta { font-weight: 700; color: var(--accent-strong); text-align: right; white-space: nowrap; }
.mv-delta.neg { color: var(--text); }
.mv-info { overflow-wrap: anywhere; }
.mv-meta { display: block; font-size: 12.5px; }
.code { font-family: ui-monospace, monospace; font-weight: 700; color: var(--accent); }
</style>
