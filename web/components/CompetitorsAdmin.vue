<template>
  <section class="competitors">
    <!-- En la cabecera de la seccion, a la derecha (solo en cliente: Teleport fuera de #teleports no se renderiza en SSR) -->
    <ClientOnly>
      <Teleport to="#staff-hero-actions">
        <button class="button" type="button" @click="startCreate">+ Cafetería</button>
      </Teleport>
    </ClientOnly>

    <SegmentedControl
      v-model="view"
      aria-label="Vista"
      :options="[{ value: 'comparativa', label: 'Comparativa', icon: Scale }, { value: 'cafeterias', label: 'Cafeterías', icon: Store }]"
    />

    <p v-if="aiEnabled === false" class="notice">
      <Info :size="16" :stroke-width="1.8" aria-hidden="true" />
      La lectura de menús con IA no está configurada en el servidor (falta <code>ANTHROPIC_API_KEY</code>). Puedes añadir los precios a mano.
    </p>
    <p v-if="loadError" class="error">{{ loadError }}</p>

    <Transition :name="view === 'cafeterias' ? 'tab-swap-next' : 'tab-swap-prev'" mode="out-in">
      <!-- ===================== Comparativa ===================== -->
      <div v-if="view === 'comparativa'" class="comparison">
        <div class="comparison-head">
          <p class="muted summary">
            <template v-if="rows.length">
              {{ rows.length }} {{ rows.length === 1 ? "producto comparado" : "productos comparados" }}:
              <strong class="pricier">{{ pricierCount }} por encima</strong> de la media (+{{ THRESHOLD }} % o más),
              <strong class="cheaper">{{ cheaperCount }} por debajo</strong> y {{ rows.length - pricierCount - cheaperCount }} en la media.
            </template>
          </p>
          <label class="check">
            <input v-model="includeUnconfirmed" type="checkbox" role="switch" />
            Incluir emparejamientos sin confirmar
          </label>
        </div>

        <EmptyState v-if="!comparisonLoading && !rows.length" :icon="Scale" title="Aún no hay productos para comparar">
          Añade una cafetería, sube su menú y léelo: los productos que se emparejen con los nuestros saldrán aquí.
        </EmptyState>

        <div v-else class="table card" role="table" aria-label="Comparativa de precios">
          <div class="tr th" role="row">
            <span role="columnheader">Producto</span>
            <span role="columnheader" class="num">Nuestro</span>
            <span role="columnheader" class="num">Competencia</span>
            <span role="columnheader" class="num">Media</span>
            <span role="columnheader" class="num">Diferencia</span>
          </div>
          <template v-for="row in rows" :key="row.menuItemId">
            <button class="tr row-btn" type="button" role="row" :aria-expanded="expanded === row.menuItemId" @click="expanded = expanded === row.menuItemId ? null : row.menuItemId">
              <span role="cell" class="product">
                <ChevronRight class="chev" :class="{ open: expanded === row.menuItemId }" :size="16" :stroke-width="2" aria-hidden="true" />
                <span>
                  <strong>{{ row.menuItemName }}</strong>
                  <span class="muted sub">{{ row.categoryName }} · {{ row.entries.length }} {{ row.entries.length === 1 ? "precio" : "precios" }}</span>
                </span>
              </span>
              <span role="cell" class="num tabular-nums"><span class="cell-label">Nuestro</span>{{ formatPrice(row.ourPriceCents) }}</span>
              <span role="cell" class="num tabular-nums muted">
                <span class="cell-label">Competencia</span>{{ row.minCents === row.maxCents ? formatPrice(row.minCents) : `${formatPrice(row.minCents)} – ${formatPrice(row.maxCents)}` }}
              </span>
              <span role="cell" class="num tabular-nums"><span class="cell-label">Media</span>{{ formatPrice(row.avgCents) }}</span>
              <span role="cell" class="num">
                <span class="diff tabular-nums" :class="diffClass(row.diffPct)">{{ formatPct(row.diffPct) }}</span>
              </span>
            </button>
            <ul v-if="expanded === row.menuItemId" class="entries" role="row">
              <li v-for="(e, i) in row.entries" :key="i">
                <span><strong>{{ e.competitorName }}</strong> · {{ e.itemName }}<template v-if="e.size"> ({{ e.size }})</template></span>
                <span v-if="!e.confirmed" class="badge">sin confirmar</span>
                <span class="tabular-nums">{{ formatPrice(e.priceCents) }}</span>
              </li>
            </ul>
          </template>
        </div>
      </div>

      <!-- ===================== Cafeterias ===================== -->
      <div v-else class="wide-layout">
        <div class="wide-main">
          <!-- Alta -->
          <form v-if="creating" class="card stack" @submit.prevent="create">
            <h3>Nueva cafetería</h3>
            <label class="field"><span class="muted">Nombre</span><input v-model="newForm.name" required maxlength="120" /></label>
            <label class="field"><span class="muted">Barrio o zona (opcional)</span><input v-model="newForm.neighborhood" maxlength="120" placeholder="Laureles, El Poblado…" /></label>
            <p v-if="formError" class="error">{{ formError }}</p>
            <div class="actions">
              <button class="button" type="submit" :disabled="busy">Crear</button>
              <button class="button secondary" type="button" @click="creating = false">Cancelar</button>
            </div>
          </form>

          <EmptyState v-else-if="!selected" :icon="Store" title="Elige una cafetería">O añade una con «+ Cafetería».</EmptyState>

          <!-- Ficha de la cafeteria -->
          <div v-else class="card stack detail">
            <div class="detail-head">
              <div v-if="!editingInfo">
                <h3>{{ selected.name }}</h3>
                <p v-if="selected.neighborhood || selected.notes" class="muted">{{ [selected.neighborhood, selected.notes].filter(Boolean).join(" · ") }}</p>
              </div>
              <form v-else class="info-form" @submit.prevent="saveInfo">
                <input v-model="infoForm.name" required maxlength="120" aria-label="Nombre" />
                <input v-model="infoForm.neighborhood" maxlength="120" placeholder="Barrio o zona" aria-label="Barrio o zona" />
                <input v-model="infoForm.notes" maxlength="500" placeholder="Notas" aria-label="Notas" />
                <div class="actions">
                  <button class="button" type="submit" :disabled="busy">Guardar</button>
                  <button class="button secondary" type="button" @click="editingInfo = false">Cancelar</button>
                </div>
              </form>
              <div v-if="!editingInfo" class="head-actions">
                <button class="icon-button" type="button" aria-label="Editar datos" title="Editar datos" @click="startEditInfo">
                  <Pencil :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
                <button class="icon-button danger" type="button" aria-label="Eliminar cafetería" title="Eliminar cafetería" @click="confirmingDelete = true">
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p v-if="confirmingDelete" class="confirm">
              ¿Eliminar {{ selected.name }} con sus {{ selected.items.length }} productos? No se puede deshacer.
              <button class="button secondary small danger" type="button" :disabled="busy" @click="remove">Sí, eliminar</button>
              <button class="button secondary small" type="button" @click="confirmingDelete = false">No</button>
            </p>

            <!-- Fuentes del menu -->
            <section class="block">
              <h4>Menú</h4>
              <ul v-if="selected.sources.length" class="sources">
                <li v-for="s in selected.sources" :key="s.id">
                  <component :is="s.kind === 'url' ? Link2 : s.mimeType === 'application/pdf' ? FileText : ImageIcon" :size="16" :stroke-width="1.8" aria-hidden="true" />
                  <a v-if="s.kind === 'url'" :href="s.url ?? undefined" target="_blank" rel="noopener noreferrer" class="source-name">{{ s.url }}</a>
                  <span v-else class="source-name">{{ s.fileName }}</span>
                  <button class="icon-button small" type="button" aria-label="Quitar" title="Quitar" :disabled="reading" @click="removeSource(s.id)">
                    <X :size="14" :stroke-width="2" aria-hidden="true" />
                  </button>
                </li>
              </ul>
              <p v-else class="muted">Añade el enlace a su menú (página web o PDF) o sube una foto o PDF de la carta.</p>
              <form class="add-source" @submit.prevent="addUrl">
                <input v-model="newUrl" type="url" placeholder="https://…" aria-label="Enlace al menú" :disabled="reading" />
                <button class="button secondary" type="submit" :disabled="!newUrl.trim() || busy || reading">Añadir enlace</button>
                <label class="button secondary" :class="{ disabled: uploading || reading }">
                  <Upload :size="16" :stroke-width="1.8" aria-hidden="true" />
                  {{ uploading ? "Subiendo…" : "Subir PDF o foto" }}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" class="visually-hidden" :disabled="uploading || reading" @change="uploadFile" />
                </label>
              </form>

              <div class="read-row">
                <button class="button" type="button" :disabled="!aiEnabled || !selected.sources.length || reading || busy" @click="readMenu">
                  <Sparkles :size="16" :stroke-width="1.8" aria-hidden="true" />
                  {{ reading ? "Leyendo el menú…" : selected.lastReadAt ? "Volver a leer el menú" : "Leer el menú con IA" }}
                </button>
                <span v-if="reading" class="muted">Puede tardar un par de minutos. Puedes seguir con otra cosa.</span>
                <span v-else-if="selected.lastReadAt" class="muted">Leído el {{ formatDate(selected.lastReadAt) }}<template v-if="selected.lastReadByName"> por {{ selected.lastReadByName }}</template>.</span>
              </div>
              <p v-if="selected.readStatus === 'error' && selected.lastReadError" class="error">{{ selected.lastReadError }}</p>
              <p v-if="selected.lastReadNote && !reading" class="note"><Info :size="15" :stroke-width="1.8" aria-hidden="true" /> {{ selected.lastReadNote }}</p>
            </section>

            <!-- Productos -->
            <section class="block">
              <div class="block-head">
                <h4>Productos ({{ selected.items.length }})</h4>
                <button v-if="unconfirmedCount" class="button secondary small" type="button" :disabled="busy" @click="confirmAll">
                  <Check :size="15" :stroke-width="2" aria-hidden="true" /> Confirmar {{ unconfirmedCount }} {{ unconfirmedCount === 1 ? "emparejamiento" : "emparejamientos" }}
                </button>
              </div>
              <p v-if="selected.items.length" class="muted hint">Revisa los precios y elige el producto equivalente de nuestra carta. Los propuestos por la IA salen marcados hasta que los confirmes.</p>

              <ul class="items">
                <li v-for="item in selected.items" :key="item.id" class="item" :class="{ proposed: item.menuItemId && !item.matchConfirmed }">
                  <div class="item-main">
                    <strong>{{ item.name }}</strong><span v-if="item.size" class="muted"> · {{ item.size }}</span>
                    <span v-if="item.category" class="muted sub">{{ item.category }}<template v-if="item.manual"> · añadido a mano</template></span>
                    <span v-else-if="item.manual" class="muted sub">añadido a mano</span>
                  </div>
                  <label class="price-field">
                    <span class="visually-hidden">Precio</span>
                    <span class="money"><span aria-hidden="true">$</span>
                      <input type="number" inputmode="numeric" min="100" step="1" :value="item.priceCents" :disabled="busy" @change="savePrice(item, ($event.target as HTMLInputElement).value)" />
                    </span>
                    <span v-if="item.previousPriceCents != null" class="muted was tabular-nums">antes {{ formatPrice(item.previousPriceCents) }}</span>
                  </label>
                  <div class="match">
                    <select :value="item.menuItemId ?? ''" :disabled="busy" aria-label="Equivalente en nuestra carta" @change="saveMatch(item, ($event.target as HTMLSelectElement).value)">
                      <option value="">— Sin equivalente —</option>
                      <optgroup v-for="cat in ourMenu" :key="cat.id" :label="cat.name">
                        <option v-for="m in cat.items" :key="m.id" :value="m.id">{{ m.name }} · {{ formatPrice(m.priceCents) }}</option>
                      </optgroup>
                    </select>
                    <button
                      v-if="item.menuItemId && !item.matchConfirmed"
                      class="icon-button small accent"
                      type="button"
                      aria-label="Confirmar emparejamiento"
                      title="Confirmar emparejamiento"
                      :disabled="busy"
                      @click="confirmItem(item)"
                    >
                      <Check :size="15" :stroke-width="2.2" aria-hidden="true" />
                    </button>
                  </div>
                  <button class="icon-button small" type="button" aria-label="Quitar producto" title="Quitar producto" :disabled="busy" @click="deleteItem(item)">
                    <Trash2 :size="14" :stroke-width="1.8" aria-hidden="true" />
                  </button>
                </li>
              </ul>

              <!-- Alta a mano -->
              <form class="add-item" @submit.prevent="addItem">
                <input v-model="itemForm.name" placeholder="Producto" maxlength="160" aria-label="Producto" required />
                <input v-model="itemForm.size" placeholder="Tamaño" maxlength="40" aria-label="Tamaño" />
                <input v-model="itemForm.price" type="number" inputmode="numeric" min="100" step="1" placeholder="Precio" aria-label="Precio" required />
                <select v-model="itemForm.menuItemId" aria-label="Equivalente en nuestra carta">
                  <option value="">— Sin equivalente —</option>
                  <optgroup v-for="cat in ourMenu" :key="cat.id" :label="cat.name">
                    <option v-for="m in cat.items" :key="m.id" :value="m.id">{{ m.name }}</option>
                  </optgroup>
                </select>
                <button class="button secondary" type="submit" :disabled="busy">Añadir a mano</button>
              </form>
            </section>
            <p v-if="formError" class="error">{{ formError }}</p>
          </div>
        </div>

        <!-- Listado -->
        <aside class="wide-aside wide-aside--sticky list">
          <p v-if="loading && !competitors.length" class="muted">Cargando…</p>
          <button
            v-for="c in competitors"
            :key="c.id"
            type="button"
            class="card list-row"
            :class="{ on: c.id === selectedId }"
            @click="select(c.id)"
          >
            <span class="list-text">
              <strong>{{ c.name }}</strong>
              <span class="muted">{{ [c.neighborhood, `${c.items.length} productos`].filter(Boolean).join(" · ") }}</span>
            </span>
            <span v-if="c.readStatus === 'reading'" class="badge reading">Leyendo…</span>
            <span v-else-if="c.readStatus === 'error'" class="badge error-badge">Error</span>
            <span v-else-if="pendingOf(c)" class="badge">{{ pendingOf(c) }} por revisar</span>
          </button>
          <EmptyState v-if="!loading && !competitors.length" :icon="Store" title="Aún no hay cafeterías" compact />
        </aside>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Check, ChevronRight, FileText, ImageIcon, Info, Link2, Pencil, Scale, Sparkles, Store, Trash2, Upload, X } from "lucide-vue-next";
import EmptyState from "~/components/EmptyState.vue";
import SegmentedControl from "~/components/SegmentedControl.vue";
import { shrinkImage } from "~/composables/useImageResize";

interface CompetitorItem {
  id: string;
  name: string;
  size: string | null;
  category: string | null;
  priceCents: number;
  menuItemId: string | null;
  menuItemName: string | null;
  matchConfirmed: boolean;
  manual: boolean;
  previousPriceCents: number | null;
}
interface Competitor {
  id: string;
  name: string;
  neighborhood: string | null;
  notes: string | null;
  sources: { id: string; kind: "url" | "file"; url: string | null; fileName: string | null; mimeType: string | null }[];
  items: CompetitorItem[];
  readStatus: "idle" | "reading" | "error";
  lastReadAt: string | null;
  lastReadError: string | null;
  lastReadNote: string | null;
  lastReadByName: string | null;
}
interface ComparisonRow {
  menuItemId: string;
  menuItemName: string;
  categoryName: string | null;
  ourPriceCents: number;
  entries: { competitorId: string; competitorName: string; itemName: string; size: string | null; priceCents: number; confirmed: boolean }[];
  minCents: number;
  avgCents: number;
  maxCents: number;
  diffPct: number;
}

const COMPETITOR_FIELDS = `
  id name neighborhood notes readStatus lastReadAt lastReadError lastReadNote lastReadByName
  sources { id kind url fileName mimeType }
  items { id name size category priceCents menuItemId menuItemName matchConfirmed manual previousPriceCents }
`;
const COMPETITORS_QUERY = gql`
  query Competitors {
    competitors { ${COMPETITOR_FIELDS} }
    competitorAiEnabled
    menu { id name items(includeUnavailable: true) { id name priceCents } }
  }
`;
const COMPARISON_QUERY = gql`
  query PriceComparison($includeUnconfirmed: Boolean) {
    priceComparison(includeUnconfirmed: $includeUnconfirmed) {
      menuItemId menuItemName categoryName ourPriceCents minCents avgCents maxCents diffPct
      entries { competitorId competitorName itemName size priceCents confirmed }
    }
  }
`;
const M = {
  create: gql`mutation ($name: String!, $neighborhood: String) { createCompetitor(name: $name, neighborhood: $neighborhood) { id } }`,
  update: gql`mutation ($id: ID!, $name: String, $neighborhood: String, $notes: String) { updateCompetitor(id: $id, name: $name, neighborhood: $neighborhood, notes: $notes) { id } }`,
  remove: gql`mutation ($id: ID!) { deleteCompetitor(id: $id) }`,
  addUrl: gql`mutation ($id: ID!, $url: String!) { addCompetitorUrl(id: $id, url: $url) { id } }`,
  removeSource: gql`mutation ($id: ID!, $sourceId: ID!) { removeCompetitorSource(id: $id, sourceId: $sourceId) { id } }`,
  read: gql`mutation ($id: ID!) { readCompetitorMenu(id: $id) { id readStatus } }`,
  updateItem: gql`mutation ($id: ID!, $itemId: ID!, $input: CompetitorItemInput!, $matchConfirmed: Boolean) { updateCompetitorItem(id: $id, itemId: $itemId, input: $input, matchConfirmed: $matchConfirmed) { id } }`,
  addItem: gql`mutation ($id: ID!, $input: CompetitorItemInput!) { addCompetitorItem(id: $id, input: $input) { id } }`,
  deleteItem: gql`mutation ($id: ID!, $itemId: ID!) { deleteCompetitorItem(id: $id, itemId: $itemId) { id } }`,
  confirmAll: gql`mutation ($id: ID!) { confirmCompetitorMatches(id: $id) { id } }`,
};

/** Diferencia con la media a partir de la cual se marca (por encima o por debajo). */
const THRESHOLD = 10;

const view = ref<"comparativa" | "cafeterias">("comparativa");
const includeUnconfirmed = ref(true);
const expanded = ref<string | null>(null);

const { result, loading, error, refetch } = useQuery<{
  competitors: Competitor[];
  competitorAiEnabled: boolean;
  menu: { id: string; name: string; items: { id: string; name: string; priceCents: number }[] }[];
}>(COMPETITORS_QUERY, null, { fetchPolicy: "cache-and-network" });
const { result: comparisonResult, loading: comparisonLoading, refetch: refetchComparison } = useQuery<{ priceComparison: ComparisonRow[] }>(
  COMPARISON_QUERY,
  () => ({ includeUnconfirmed: includeUnconfirmed.value }),
  { fetchPolicy: "cache-and-network" }
);

const competitors = computed(() => result.value?.competitors ?? []);
const aiEnabled = computed(() => result.value?.competitorAiEnabled);
const ourMenu = computed(() => (result.value?.menu ?? []).filter((c) => c.items.length));
const rows = computed(() => comparisonResult.value?.priceComparison ?? []);
const pricierCount = computed(() => rows.value.filter((r) => r.diffPct >= THRESHOLD).length);
const cheaperCount = computed(() => rows.value.filter((r) => r.diffPct <= -THRESHOLD).length);
const loadError = computed(() => (error.value ? "No se pudo cargar la competencia." : ""));

const selectedId = ref<string | null>(null);
const selected = computed(() => competitors.value.find((c) => c.id === selectedId.value) ?? null);
const reading = computed(() => selected.value?.readStatus === "reading");
const unconfirmedCount = computed(() => selected.value?.items.filter((i) => i.menuItemId && !i.matchConfirmed).length ?? 0);
const pendingOf = (c: Competitor) => c.items.filter((i) => i.menuItemId && !i.matchConfirmed).length;

const busy = ref(false);
const formError = ref("");
const creating = ref(false);
const newForm = reactive({ name: "", neighborhood: "" });
const editingInfo = ref(false);
const infoForm = reactive({ name: "", neighborhood: "", notes: "" });
const confirmingDelete = ref(false);
const newUrl = ref("");
const uploading = ref(false);
const itemForm = reactive({ name: "", size: "", price: "" as string | number, menuItemId: "" });

function select(id: string) {
  selectedId.value = id;
  creating.value = false;
  editingInfo.value = false;
  confirmingDelete.value = false;
  formError.value = "";
}

function startCreate() {
  view.value = "cafeterias";
  creating.value = true;
  formError.value = "";
  Object.assign(newForm, { name: "", neighborhood: "" });
}

// Mientras alguna se este leyendo, se consulta cada pocos segundos hasta que acabe.
let poll: ReturnType<typeof setInterval> | null = null;
watch(
  () => competitors.value.some((c) => c.readStatus === "reading"),
  (anyReading, wasReading) => {
    if (anyReading && !poll) poll = setInterval(() => refetch(), 3000);
    if (!anyReading && poll) {
      clearInterval(poll);
      poll = null;
    }
    if (wasReading && !anyReading) refetchComparison();
  },
  { immediate: true }
);
onBeforeUnmount(() => poll && clearInterval(poll));

/** Ejecuta una mutacion, refresca la lista y la comparativa, y deja el error a la vista. */
async function run(mutation: any, variables: Record<string, unknown>) {
  busy.value = true;
  formError.value = "";
  try {
    const res = await useMutation(mutation).mutate(variables);
    await Promise.all([refetch(), refetchComparison()]);
    return res;
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar";
    return null;
  } finally {
    busy.value = false;
  }
}

async function create() {
  const res = await run(M.create, { name: newForm.name.trim(), neighborhood: newForm.neighborhood.trim() || null });
  const id = (res as any)?.data?.createCompetitor?.id;
  if (id) select(id);
}
function startEditInfo() {
  if (!selected.value) return;
  Object.assign(infoForm, { name: selected.value.name, neighborhood: selected.value.neighborhood ?? "", notes: selected.value.notes ?? "" });
  editingInfo.value = true;
}
async function saveInfo() {
  if (await run(M.update, { id: selectedId.value, ...infoForm })) editingInfo.value = false;
}
async function remove() {
  if (await run(M.remove, { id: selectedId.value })) selectedId.value = null;
  confirmingDelete.value = false;
}
async function addUrl() {
  if (await run(M.addUrl, { id: selectedId.value, url: newUrl.value.trim() })) newUrl.value = "";
}
const removeSource = (sourceId: string) => run(M.removeSource, { id: selectedId.value, sourceId });
const readMenu = () => run(M.read, { id: selectedId.value });
const confirmAll = () => run(M.confirmAll, { id: selectedId.value });

const itemInput = (item: CompetitorItem, patch: Partial<{ priceCents: number; menuItemId: string | null }>) => ({
  name: item.name,
  size: item.size,
  priceCents: item.priceCents,
  menuItemId: item.menuItemId,
  ...patch,
});
function savePrice(item: CompetitorItem, value: string) {
  const price = Number(value);
  if (!Number.isInteger(price) || price < 100) {
    formError.value = "Escribe el precio en pesos, sin decimales";
    return;
  }
  if (price !== item.priceCents) run(M.updateItem, { id: selectedId.value, itemId: item.id, input: itemInput(item, { priceCents: price }) });
}
const saveMatch = (item: CompetitorItem, menuItemId: string) =>
  run(M.updateItem, { id: selectedId.value, itemId: item.id, input: itemInput(item, { menuItemId: menuItemId || null }), matchConfirmed: true });
const confirmItem = (item: CompetitorItem) => run(M.updateItem, { id: selectedId.value, itemId: item.id, input: itemInput(item, {}), matchConfirmed: true });
const deleteItem = (item: CompetitorItem) => run(M.deleteItem, { id: selectedId.value, itemId: item.id });
async function addItem() {
  const ok = await run(M.addItem, {
    id: selectedId.value,
    input: { name: itemForm.name.trim(), size: itemForm.size.trim() || null, priceCents: Number(itemForm.price), menuItemId: itemForm.menuItemId || null },
  });
  if (ok) Object.assign(itemForm, { name: "", size: "", price: "", menuItemId: "" });
}

// Subida de PDF o foto del menu: las fotos se reescalan antes (lado mayor 2000 px, sin EXIF).
const config = useRuntimeConfig();
const token = useCookie("lq_auth_token");
async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !selectedId.value) return;
  uploading.value = true;
  formError.value = "";
  try {
    const body = new FormData();
    if (file.type.startsWith("image/")) body.append("file", await shrinkImage(file, 2000, 0.85), file.name.replace(/\.\w+$/, "") + ".jpg");
    else body.append("file", file);
    const base = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
    const res = await fetch(`${base}/uploads/competitor-menu?competitorId=${encodeURIComponent(selectedId.value)}`, {
      method: "POST",
      headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "No se pudo subir el archivo");
    await refetch();
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo subir el archivo";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
function formatPct(pct: number) {
  if (Math.abs(pct) < 0.5) return "= media";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 0 })} %`;
}
const diffClass = (pct: number) => (pct >= THRESHOLD ? "pricier" : pct <= -THRESHOLD ? "cheaper" : "even");
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
</script>

<style scoped>
.competitors { display: flex; flex-direction: column; gap: 16px; }
/* Tan ancha como la cabecera (.wide-head) en las dos vistas, no solo en la de dos columnas */
@media (min-width: 1000px) and (orientation: landscape) {
  .competitors {
    --wide-width: min(1160px, calc(100vw - 40px));
    width: var(--wide-width);
    margin-left: calc((100% - var(--wide-width)) / 2);
  }
}
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  font-size: 14px;
}
.error { margin: 0; color: var(--danger); }
.muted.sub { display: block; font-size: 12.5px; }

/* --- Comparativa --- */
.comparison { display: flex; flex-direction: column; gap: 12px; }
.comparison-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.summary { margin: 0; }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
.check input { margin: 0; }
.pricier { color: var(--danger); }
.cheaper { color: var(--accent); }

.table { padding: 0; overflow: hidden; }
.tr {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) repeat(3, minmax(0, 1fr)) 110px;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.th { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.row-btn { width: 100%; border: none; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.row-btn:hover { background: color-mix(in srgb, var(--text) 4%, transparent); }
.row-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.num { text-align: right; }
.product { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.chev { flex-shrink: 0; margin-top: 3px; color: var(--text-muted); transition: transform 0.2s ease; }
.chev.open { transform: rotate(90deg); }
.cell-label { display: none; }
.diff { display: inline-block; min-width: 72px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 13.5px; text-align: center; }
.diff.pricier { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.diff.cheaper { background: var(--accent-soft); color: var(--on-accent-soft); }
.diff.even { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text-muted); }
.entries { list-style: none; margin: 0; padding: 6px 16px 12px 38px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--text) 3%, transparent); }
.entries li { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; font-size: 14px; }
.entries li > :first-child { flex: 1; min-width: 0; }
.badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 600;
}
.badge.reading { border-color: var(--accent); color: var(--accent); }
.badge.error-badge { border-color: var(--danger); color: var(--danger); }

@media (max-width: 760px) {
  .th { display: none; }
  .tr { grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .product { grid-column: 1 / -1; }
  .num { text-align: left; }
  .cell-label { display: block; font-size: 11.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .entries { padding-left: 16px; }
}

/* --- Cafeterias --- */
.stack { display: flex; flex-direction: column; gap: 12px; }
.stack h3, .detail-head h3 { margin: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.detail-head p { margin: 4px 0 0; }
.head-actions { display: flex; gap: 6px; }
.info-form { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.field { display: flex; flex-direction: column; gap: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; }
.block { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border); }
.block h4 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.block-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.hint { margin: 0; font-size: 13px; }

.sources { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sources li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.source-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add-source { display: flex; flex-wrap: wrap; gap: 8px; }
.add-source input[type="url"] { flex: 1 1 220px; }
.button.disabled { opacity: 0.45; pointer-events: none; }
.read-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.read-row .muted { font-size: 13.5px; }
.note { display: flex; gap: 8px; margin: 0; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--text) 5%, transparent); font-size: 13.5px; }
.note svg { flex-shrink: 0; margin-top: 2px; }

.items { list-style: none; margin: 0; padding: 0; }
.item {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 150px minmax(0, 1.4fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.item.proposed .match select { border-style: dashed; border-color: var(--accent); }
.item-main { min-width: 0; }
.price-field { display: flex; flex-direction: column; gap: 2px; }
.was { font-size: 12px; }
.money { position: relative; display: block; }
.money > span { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.money input { width: 100%; padding-left: 22px; }
.match { display: flex; align-items: center; gap: 6px; min-width: 0; }
.match select { flex: 1; min-width: 0; }
@media (max-width: 760px) {
  .item { grid-template-columns: 1fr auto; }
  .item-main { grid-column: 1 / -1; }
  .match { grid-column: 1 / -1; }
}
.add-item { display: grid; grid-template-columns: minmax(0, 1.4fr) 90px 110px minmax(0, 1.4fr) auto; gap: 8px; padding-top: 6px; }
@media (max-width: 760px) { .add-item { grid-template-columns: 1fr 1fr; } .add-item > :first-child, .add-item select { grid-column: 1 / -1; } }

select, input:not([type="checkbox"]):not([type="file"]) {
  min-width: 0;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14.5px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.icon-button.small { width: 30px; height: 30px; }
.icon-button.danger { color: var(--danger); }
.icon-button.accent { border-color: var(--accent); color: var(--accent); }
.icon-button:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 8%, transparent); }
.icon-button:disabled { opacity: 0.4; cursor: not-allowed; }
.icon-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.button.small { min-height: 32px; padding: 4px 12px; font-size: 13px; }
.button.danger { color: var(--danger); }

.list { gap: 8px; }
.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.list-row.on { border-color: var(--accent); }
.list-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.list-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.list-text .muted { font-size: 13px; }
</style>
