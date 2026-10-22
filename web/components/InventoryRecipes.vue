<template>
  <div class="recipes-view">
    <p class="muted intro">
      La receta dice qué insumos gasta <strong>una unidad</strong> de cada producto. Al entregar un
      pedido se descuentan solos. Marca «solo para llevar»
      (<CupSoda class="inline-icon" :size="15" :stroke-width="1.8" aria-hidden="true" />) en vasos, tapas y similares: se
      descuentan en los pedidos web y en los «para llevar», no en los de mesa. Qué insumo es cada
      opción de leche se indica al final de la página.
    </p>

    <div class="toolbar">
      <input v-model="search" class="search" type="search" placeholder="Buscar producto" aria-label="Buscar producto" />
      <label class="icon-toggle only-missing" :title="`Solo productos sin receta (${missingCount})`">
        <input v-model="onlyMissing" type="checkbox" class="visually-hidden" :aria-label="`Solo productos sin receta (${missingCount})`" />
        <ClipboardX :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span v-if="missingCount" class="toggle-count" aria-hidden="true">{{ missingCount }}</span>
      </label>
    </div>

    <p v-if="!supplies.length && !loading" class="muted">Primero da de alta los insumos en «Stock».</p>
    <p v-if="loading && !categories.length" class="muted">Cargando la carta…</p>
    <EmptyState v-else-if="categories.length && onlyMissing && !missingCount" :icon="ClipboardCheck" title="No hay ningún producto sin receta" />
    <EmptyState v-else-if="categories.length && !groups.length" :icon="SearchX" title="Ningún producto coincide" />

    <!-- Cada grupo empieza plegado -->
    <CollapsibleGroup
      v-for="group in groups"
      :key="group.id"
      :title="group.name"
      :open="isOpen(group.id)"
      @update:open="toggleGroup(group.id)"
    >
      <template #meta>
        {{ group.items.length }}
        <span v-if="group.missing" class="group-missing">· {{ group.missing }} sin receta</span>
      </template>
      <ul class="product-list">
        <li v-for="item in group.items" :key="item.id" class="product-row" :class="{ editing: editingId === item.id }">
          <!-- Toda la fila abre el editor (crear o editar la receta); con el editor abierto, lo cierra
               sin guardar, igual que la X -->
          <button
            class="product-head"
            type="button"
            :disabled="saving && editingId === item.id"
            :aria-expanded="editingId === item.id"
            :title="editingId === item.id ? 'Cerrar sin guardar' : recipeFor(item.id) ? 'Editar receta' : 'Crear receta'"
            @click="editingId === item.id ? (editingId = '') : startEdit(item.id)"
          >
            <span class="product-info">
              <span class="product-name">
                {{ item.name }}
                <span v-if="!item.available" class="muted">(no disponible)</span>
              </span>
              <span v-if="recipeFor(item.id)" class="muted summary">{{ summary(recipeFor(item.id)!) }}</span>
              <span v-else class="missing">Sin receta</span>
            </span>
          </button>
          <!-- Cerrar el editor sin guardar -->
          <button
            v-if="editingId === item.id"
            class="close-editor"
            type="button"
            aria-label="Cerrar sin guardar"
            title="Cerrar sin guardar"
            :disabled="saving"
            @click="editingId = ''"
          >
            <X :size="22" :stroke-width="2" aria-hidden="true" />
          </button>

          <!-- Editor -->
          <form v-if="editingId === item.id" class="editor" @submit.prevent="save(item.id)">
            <p v-if="!draft.length" class="muted">Sin ingredientes. Añade el primero.</p>
            <div v-for="(line, index) in draft" :key="line.key" class="line">
              <!-- "Solo para llevar", a la izquierda del insumo. Interruptor con icono: el checkbox sigue ahi (oculto) para teclado y lectores de pantalla -->
              <label class="icon-toggle" title="Solo para llevar">
                <input v-model="line.onlyTakeaway" type="checkbox" class="visually-hidden" aria-label="Solo para llevar" />
                <CupSoda :size="20" :stroke-width="1.8" aria-hidden="true" />
              </label>
              <select v-model="line.supplyId" aria-label="Insumo">
                <option value="" disabled>Insumo…</option>
                <option v-for="s in selectableSupplies(line.supplyId)" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <QtyInput
                v-if="supplyById(line.supplyId)"
                :key="line.supplyId"
                v-model="line.qty"
                :unit="supplyById(line.supplyId)!.unit"
                class="line-qty"
                aria-label="Cantidad por unidad"
              />
              <span v-else class="line-qty" />
              <button class="remove" type="button" :aria-label="`Quitar ingrediente ${index + 1}`" @click="draft.splice(index, 1)">×</button>
            </div>
            <button class="button secondary small add-line" type="button" @click="addLine">+ Ingrediente</button>

            <p v-if="error" class="error">{{ error }}</p>
            <div class="actions">
              <button class="button" type="submit" :disabled="saving || !canSave">{{ saving ? "Guardando…" : "Guardar" }}</button>
              <button v-if="recipeFor(item.id)" class="button secondary danger push" type="button" :disabled="saving" @click="save(item.id, true)">
                Quitar receta
              </button>
            </div>
          </form>
        </li>
      </ul>
    </CollapsibleGroup>

    <InventoryOptionSupplies :supplies="supplies" />
  </div>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { ClipboardCheck, ClipboardX, CupSoda, SearchX, X } from "lucide-vue-next";
import {
  formatQty,
  RECIPE_MENU_QUERY,
  RECIPES_QUERY,
  SET_RECIPE,
  SUPPLIES_QUERY,
  type Recipe,
  type Supply,
} from "~/composables/useInventory";
import QtyInput from "~/components/QtyInput.vue";
import CollapsibleGroup from "~/components/CollapsibleGroup.vue";
import InventoryOptionSupplies from "~/components/InventoryOptionSupplies.vue";

interface RecipeMenuCategory {
  id: string;
  name: string;
  items: { id: string; name: string; available: boolean }[];
}

const { result: menuResult, loading } = useQuery<{ menu: RecipeMenuCategory[] }>(RECIPE_MENU_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));
const { result: recipesResult, refetch: refetchRecipes } = useQuery<{ recipes: Recipe[] }>(RECIPES_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));
const { result: suppliesResult } = useQuery<{ supplies: Supply[] }>(SUPPLIES_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));

const categories = computed(() => menuResult.value?.menu ?? []);
const recipes = computed(() => recipesResult.value?.recipes ?? []);
const supplies = computed(() => suppliesResult.value?.supplies ?? []);

function recipeFor(menuItemId: string) {
  return recipes.value.find((r) => r.menuItemId === menuItemId) ?? null;
}
function supplyById(id: string) {
  return supplies.value.find((s) => s.id === id) ?? null;
}
function summary(recipe: Recipe) {
  return recipe.lines
    .map((l) => `${formatQty(l.qty, l.supply.unit)} ${l.supply.name}${l.onlyTakeaway ? " (llevar)" : ""}`)
    .join(" · ");
}

const search = ref("");
const onlyMissing = ref(false);
const missingCount = computed(
  () => categories.value.flatMap((c) => c.items).filter((i) => !recipeFor(i.id)).length
);

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const groups = computed(() => {
  const q = normalize(search.value.trim());
  return categories.value
    .map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => (!q || normalize(i.name).includes(q)) && (!onlyMissing.value || !recipeFor(i.id))
      ),
    }))
    .filter((c) => c.items.length)
    .map((c) => ({ ...c, missing: c.items.filter((i) => !recipeFor(i.id)).length }));
});

// Grupos desplegados (por defecto, ninguno).
const openGroups = ref(new Set<string>());
function isOpen(id: string) {
  return openGroups.value.has(id);
}
function toggleGroup(id: string) {
  const next = new Set(openGroups.value);
  if (!next.delete(id)) next.add(id);
  openGroups.value = next;
}
// Al buscar o filtrar "sin receta" se despliegan los grupos con resultados: si no, no se verian.
watch(
  () => [search.value.trim(), onlyMissing.value] as const,
  ([q, missing]) => {
    if (q || missing) openGroups.value = new Set([...openGroups.value, ...groups.value.map((g) => g.id)]);
  }
);

// --- Editor (una receta a la vez) ---
interface DraftLine {
  key: number;
  supplyId: string;
  qty: number | null;
  onlyTakeaway: boolean;
}
let nextKey = 0;
const editingId = ref("");
const draft = ref<DraftLine[]>([]);
const saving = ref(false);
const error = ref("");

// Solo insumos activos; el que ya tuviera la linea se mantiene en la lista aunque se desactive.
function selectableSupplies(current: string) {
  return supplies.value.filter((s) => s.active || s.id === current);
}

function startEdit(menuItemId: string) {
  editingId.value = menuItemId;
  error.value = "";
  draft.value = (recipeFor(menuItemId)?.lines ?? []).map((l) => ({
    key: nextKey++,
    supplyId: l.supply.id,
    qty: l.qty,
    onlyTakeaway: l.onlyTakeaway,
  }));
  if (!draft.value.length) addLine();
}
function addLine() {
  draft.value.push({ key: nextKey++, supplyId: "", qty: null, onlyTakeaway: false });
}

const canSave = computed(() => draft.value.every((l) => l.supplyId && l.qty !== null && l.qty > 0));

const { mutate: setRecipe } = useMutation(SET_RECIPE);

async function save(menuItemId: string, removeRecipe = false) {
  saving.value = true;
  error.value = "";
  try {
    const lines = removeRecipe
      ? []
      : draft.value.map((l) => ({ supplyId: l.supplyId, qty: l.qty, onlyTakeaway: l.onlyTakeaway }));
    await setRecipe({ menuItemId, lines });
    await refetchRecipes();
    editingId.value = "";
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar la receta";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.intro { font-size: 14px; margin: 0 0 14px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.search {
  flex: 1 1 200px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}

.group-missing { color: var(--danger); }
.product-list { list-style: none; padding: 0; margin: 0; }
.product-row { position: relative; border-bottom: 1px solid var(--border); }
.product-row.editing .product-head { padding-right: 52px; }
.close-editor {
  position: absolute;
  top: 4px;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.close-editor:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }
.close-editor:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.close-editor:disabled { opacity: 0.45; cursor: not-allowed; }
.product-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.product-head:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.product-head:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.product-head:disabled { cursor: default; }
.product-row .editor { padding: 0 8px 12px; }
.product-info { display: flex; flex-direction: column; min-width: 0; }
.product-name { font-weight: 600; overflow-wrap: anywhere; }
.summary { font-size: 13.5px; overflow-wrap: anywhere; }
.missing { font-size: 13px; color: var(--danger); }
.button.small { padding: 6px 10px; font-size: 13px; min-height: 36px; flex-shrink: 0; }

.editor { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.line {
  display: grid;
  grid-template-columns: auto minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
/* Movil: vaso + insumo en una fila; cantidad y quitar debajo */
@media (max-width: 560px) {
  .line { grid-template-columns: auto minmax(0, 1fr) auto; }
  .line select { grid-column: 2 / -1; }
  .line .line-qty { grid-column: 1 / 3; }
}
.line select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
  background: var(--bg);
  color: inherit;
}
/* Interruptores con icono ("solo para llevar", "solo sin receta"): encendidos, en color de acento */
.icon-toggle {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.icon-toggle:hover { color: var(--text); }
.icon-toggle:has(input:checked) { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--bg); }
.icon-toggle:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.only-missing { width: 42px; height: 42px; }
.toggle-count {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--danger);
  color: var(--on-danger);
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.inline-icon { vertical-align: -2px; }
.remove {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
}
.add-line { align-self: flex-start; }
.error { color: var(--danger); margin: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions .push { margin-left: auto; }
.danger { color: var(--danger); border-color: var(--danger); }
</style>
