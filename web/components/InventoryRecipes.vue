<template>
  <div class="recipes-view">
    <p class="muted intro">
      La receta dice qué insumos gasta <strong>una unidad</strong> de cada producto. Al entregar un
      pedido se descuentan solos. Marca «solo para llevar» en vasos, tapas y similares: se
      descuentan en los pedidos web y en los «para llevar», no en los de mesa. Qué insumo es cada
      opción de leche se indica al final de la página.
    </p>

    <div class="toolbar">
      <input v-model="search" class="search" type="search" placeholder="Buscar producto" aria-label="Buscar producto" />
      <label class="only-missing">
        <input v-model="onlyMissing" type="checkbox" />
        Sin receta ({{ missingCount }})
      </label>
    </div>

    <p v-if="!supplies.length && !loading" class="muted">Primero da de alta los insumos en «Stock».</p>
    <p v-if="loading && !categories.length" class="muted">Cargando la carta…</p>
    <p v-else-if="categories.length && !groups.length" class="muted">Ningún producto coincide.</p>

    <section v-for="group in groups" :key="group.id" class="group">
      <h3>{{ group.name }}</h3>
      <ul class="product-list">
        <li v-for="item in group.items" :key="item.id" class="product-row">
          <div class="product-head">
            <div class="product-info">
              <span class="product-name">
                {{ item.name }}
                <span v-if="!item.available" class="muted">(no disponible)</span>
              </span>
              <span v-if="recipeFor(item.id)" class="muted summary">{{ summary(recipeFor(item.id)!) }}</span>
              <span v-else class="missing">Sin receta</span>
            </div>
            <button v-if="editingId !== item.id" class="button secondary small" type="button" @click="startEdit(item.id)">
              {{ recipeFor(item.id) ? "Editar" : "Crear receta" }}
            </button>
          </div>

          <!-- Editor -->
          <form v-if="editingId === item.id" class="editor" @submit.prevent="save(item.id)">
            <p v-if="!draft.length" class="muted">Sin ingredientes. Añade el primero.</p>
            <div v-for="(line, index) in draft" :key="line.key" class="line">
              <select v-model="line.supplyId" aria-label="Insumo">
                <option value="" disabled>Insumo…</option>
                <option v-for="s in selectableSupplies(line.supplyId)" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <QtyInput
                v-if="supplyById(line.supplyId)"
                :key="line.supplyId"
                v-model="line.qty"
                :unit="supplyById(line.supplyId)!.unit"
                aria-label="Cantidad por unidad"
              />
              <span v-else />
              <label class="takeaway">
                <input v-model="line.onlyTakeaway" type="checkbox" />
                Solo para llevar
              </label>
              <button class="remove" type="button" :aria-label="`Quitar ingrediente ${index + 1}`" @click="draft.splice(index, 1)">×</button>
            </div>
            <button class="button secondary small add-line" type="button" @click="addLine">+ Ingrediente</button>

            <p v-if="error" class="error">{{ error }}</p>
            <div class="actions">
              <button class="button" type="submit" :disabled="saving || !canSave">{{ saving ? "Guardando…" : "Guardar" }}</button>
              <button class="button secondary" type="button" :disabled="saving" @click="editingId = ''">Cancelar</button>
              <button v-if="recipeFor(item.id)" class="button secondary danger push" type="button" :disabled="saving" @click="save(item.id, true)">
                Quitar receta
              </button>
            </div>
          </form>
        </li>
      </ul>
    </section>

    <InventoryOptionSupplies :supplies="supplies" />
  </div>
</template>

<script setup lang="ts">
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
    .filter((c) => c.items.length);
});

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
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}
.only-missing { display: flex; gap: 6px; align-items: center; font-size: 14px; white-space: nowrap; }

.group { margin-bottom: 18px; }
.group h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 6px; }
.product-list { list-style: none; padding: 0; margin: 0; }
.product-row { padding: 10px 0; border-bottom: 1px solid var(--border); }
.product-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.product-info { display: flex; flex-direction: column; min-width: 0; }
.product-name { font-weight: 600; overflow-wrap: anywhere; }
.summary { font-size: 13.5px; overflow-wrap: anywhere; }
.missing { font-size: 13px; color: var(--danger); }
.button.small { padding: 6px 10px; font-size: 13px; min-height: 36px; flex-shrink: 0; }

.editor { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.line {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}
@media (max-width: 560px) {
  .line { grid-template-columns: minmax(0, 1fr) auto; }
  .line select { grid-column: 1 / -1; }
}
.line select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
  background: var(--bg);
  color: inherit;
}
.takeaway { display: flex; gap: 6px; align-items: center; font-size: 13.5px; white-space: nowrap; }
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
