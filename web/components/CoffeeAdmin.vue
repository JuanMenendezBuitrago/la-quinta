<template>
  <section class="coffee-admin">
    <p class="muted intro">
      Café tostado en grano que se vende en bolsas. Cada tamaño aparece en la carta como un producto
      («Café Huila 250 g») de la categoría «Café en grano», y su stock se lleva en Inventario en
      bolsas. El nombre, precio y disponibilidad de esos productos se cambian aquí.
    </p>

    <div class="header">
      <button class="button" :disabled="formOpen" @click="startCreate">+ Nuevo café</button>
    </div>

    <p v-if="loading && !coffees.length" class="muted">Cargando…</p>
    <p v-if="error" class="muted" style="color: var(--danger)">No se pudieron cargar los cafés.</p>

    <form v-if="formOpen" class="card coffee-form" @submit.prevent="submit">
      <h3>{{ form.id ? "Editar café" : "Nuevo café" }}</h3>

      <label class="field">
        <span class="muted">Nombre</span>
        <input v-model="form.name" type="text" required maxlength="40" placeholder="Ej. Huila" />
        <span class="muted">Los productos se llamarán «Café {{ form.name.trim() || "…" }} 250 g».</span>
      </label>

      <div class="grid-2">
        <label class="field">
          <span class="muted">Origen</span>
          <input v-model="form.origin" type="text" maxlength="80" placeholder="Región o finca" />
        </label>
        <label class="field">
          <span class="muted">Variedad</span>
          <input v-model="form.variety" type="text" maxlength="60" placeholder="Ej. Caturra" />
        </label>
        <label class="field">
          <span class="muted">Proceso</span>
          <select v-model="form.processId">
            <option value="">Sin indicar</option>
            <option v-for="p in processes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="field">
          <span class="muted">Altitud (m s. n. m.)</span>
          <input v-model.number="form.altitudeMasl" type="number" min="0" max="5000" step="1" />
        </label>
        <label class="field">
          <span class="muted">Tueste</span>
          <select v-model="form.roastLevel">
            <option value="">Sin indicar</option>
            <option v-for="(label, value) in ROAST_LABELS" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="field">
          <span class="muted">Notas de cata (separadas por comas)</span>
          <input v-model="form.tastingNotes" type="text" placeholder="Panela, mandarina, cacao" />
        </label>
      </div>

      <label class="field">
        <span class="muted">Descripción (opcional; origen, proceso y notas ya salen en la ficha del producto)</span>
        <textarea v-model="form.description" rows="2" maxlength="400"></textarea>
      </label>

      <label class="field">
        <span class="muted">Imagen</span>
        <!-- text, no url: al subir un archivo queda una ruta relativa (/uploads/…), que type="url" rechaza -->
        <input v-model="form.imageUrl" type="text" inputmode="url" placeholder="https://… (o sube un archivo)" />
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="uploading" @change="handleImageUpload" />
        <span v-if="uploading" class="muted">Subiendo imagen…</span>
        <span v-if="uploadError" class="muted" style="color: var(--danger)">{{ uploadError }}</span>
        <img v-if="form.imageUrl" :src="resolveImageUrl(form.imageUrl) ?? undefined" alt="" class="image-preview" />
      </label>

      <div class="field">
        <span class="muted">Tamaños</span>
        <div v-for="(p, i) in form.presentations" :key="i" class="size-row">
          <label class="size-grams">
            <input v-model.number="p.grams" type="number" min="1" max="5000" step="1" required aria-label="Gramos" />
            <span class="muted">g</span>
          </label>
          <label class="size-price">
            <span class="muted">$</span>
            <input v-model.number="p.priceCents" type="number" min="0" step="100" required aria-label="Precio (COP)" />
          </label>
          <label class="field-inline">
            <input v-model="p.available" type="checkbox" />
            <span class="muted">A la venta</span>
          </label>
          <button class="button secondary" type="button" :disabled="form.presentations.length === 1" @click="form.presentations.splice(i, 1)">
            Quitar
          </button>
        </div>
        <span class="muted">Quitar un tamaño lo oculta de la carta; los pedidos antiguos lo conservan.</span>
        <button class="button secondary add-size" type="button" @click="form.presentations.push({ grams: 1000, priceCents: 0, available: true })">
          + Añadir tamaño
        </button>
      </div>

      <label class="field-inline">
        <input v-model="form.available" type="checkbox" />
        <span class="muted">A la venta (sin marcar, ningún tamaño sale en la carta)</span>
      </label>

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>
      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving || uploading">{{ saving ? "Guardando…" : "Guardar" }}</button>
        <button class="button secondary" type="button" :disabled="saving" @click="formOpen = false">Cancelar</button>
      </div>
    </form>

    <p v-if="!loading && !coffees.length && !formOpen" class="muted">Todavía no hay cafés en grano.</p>

    <div v-for="coffee in coffees" :key="coffee.id" class="card coffee-row" :class="{ unavailable: !coffee.available }">
      <img v-if="coffee.imageUrl" :src="resolveImageUrl(coffee.imageUrl) ?? undefined" alt="" class="thumb" />
      <div class="coffee-info">
        <strong>{{ coffee.name }}</strong>
        <span v-if="!coffee.available" class="muted"> · no está a la venta</span>
        <p v-if="details(coffee)" class="muted">{{ details(coffee) }}</p>
        <p class="sizes">
          <span v-for="p in coffee.presentations" :key="p.grams" class="size" :class="{ off: !p.available }">
            {{ p.grams }} g · {{ formatPrice(p.priceCents) }}{{ p.available ? "" : " (oculto)" }}
          </span>
        </p>
      </div>
      <button class="button secondary" type="button" :disabled="formOpen" @click="startEdit(coffee)">Editar</button>
    </div>

    <!-- Procesos: la tabla de la que se elige el de cada cafe -->
    <section class="processes">
      <h3>Procesos</h3>
      <p class="muted">Los que se pueden elegir en la ficha de cada café. Solo se borra uno si ningún café lo usa.</p>
      <div v-for="p in processes" :key="p.id" class="process-row">
        <template v-if="editingProcessId === p.id">
          <input v-model="processDraft" type="text" maxlength="40" aria-label="Nombre del proceso" @keydown.enter.prevent="renameProcess(p.id)" />
          <button class="button secondary" type="button" :disabled="processBusy" @click="renameProcess(p.id)">Guardar</button>
          <button class="button secondary" type="button" @click="editingProcessId = ''">Cancelar</button>
        </template>
        <template v-else>
          <span class="process-name">{{ p.name }}</span>
          <span class="muted">{{ p.coffeeCount === 1 ? "1 café" : `${p.coffeeCount} cafés` }}</span>
          <button class="button secondary" type="button" @click="startRenameProcess(p)">Renombrar</button>
          <button class="button secondary" type="button" :disabled="processBusy || p.coffeeCount > 0" @click="deleteProcess(p.id)">Borrar</button>
        </template>
      </div>
      <form class="process-row" @submit.prevent="createProcess">
        <input v-model="newProcess" type="text" maxlength="40" placeholder="Nuevo proceso (ej. Anaeróbico)" aria-label="Nuevo proceso" />
        <button class="button secondary" type="submit" :disabled="processBusy || !newProcess.trim()">Añadir</button>
      </form>
      <p v-if="processError" class="muted" style="color: var(--danger)">{{ processError }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { ROAST_LABELS } from "~/composables/useMenu";

interface CoffeeAdminItem {
  id: string;
  name: string;
  origin: string | null;
  variety: string | null;
  process: { id: string; name: string } | null;
  altitudeMasl: number | null;
  roastLevel: string | null;
  tastingNotes: string[];
  description: string | null;
  imageUrl: string | null;
  available: boolean;
  presentations: { grams: number; priceCents: number; available: boolean }[];
}

const COFFEE_FIELDS = `
  id
  name
  origin
  variety
  process {
    id
    name
  }
  altitudeMasl
  roastLevel
  tastingNotes
  description
  imageUrl
  available
  presentations(includeUnavailable: true) {
    grams
    priceCents
    available
  }
`;

const COFFEES_QUERY = gql`query AdminCoffees { coffees(includeUnavailable: true) { ${COFFEE_FIELDS} } }`;
const CREATE_COFFEE = gql`mutation CreateCoffee($input: CoffeeInput!) { createCoffee(input: $input) { id } }`;
const UPDATE_COFFEE = gql`mutation UpdateCoffee($id: ID!, $input: CoffeeInput!) { updateCoffee(id: $id, input: $input) { id } }`;
const PROCESSES_QUERY = gql`query CoffeeProcesses { coffeeProcesses { id name coffeeCount } }`;
const CREATE_PROCESS = gql`mutation CreateCoffeeProcess($name: String!) { createCoffeeProcess(name: $name) { id } }`;
const RENAME_PROCESS = gql`mutation RenameCoffeeProcess($id: ID!, $name: String!) { renameCoffeeProcess(id: $id, name: $name) { id } }`;
const DELETE_PROCESS = gql`mutation DeleteCoffeeProcess($id: ID!) { deleteCoffeeProcess(id: $id) }`;

const { result, loading, error, refetch } = useQuery<{ coffees: CoffeeAdminItem[] }>(COFFEES_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));
const coffees = computed(() => result.value?.coffees ?? []);

const { result: processesResult, refetch: refetchProcesses } = useQuery<{
  coffeeProcesses: { id: string; name: string; coffeeCount: number }[];
}>(PROCESSES_QUERY, null, () => ({ fetchPolicy: "cache-and-network" }));
const processes = computed(() => processesResult.value?.coffeeProcesses ?? []);

const newProcess = ref("");
const editingProcessId = ref("");
const processDraft = ref("");
const processBusy = ref(false);
const processError = ref("");

async function processAction(action: () => Promise<unknown>) {
  processBusy.value = true;
  processError.value = "";
  try {
    await action();
    // Renombrar cambia lo que muestran los cafes; borrar o crear, los recuentos.
    await Promise.all([refetchProcesses(), refetch()]);
    return true;
  } catch (err: any) {
    processError.value = err?.message ?? "No se pudo guardar el proceso";
    return false;
  } finally {
    processBusy.value = false;
  }
}

async function createProcess() {
  const { mutate } = useMutation(CREATE_PROCESS);
  if (await processAction(() => mutate({ name: newProcess.value.trim() }))) newProcess.value = "";
}
function startRenameProcess(p: { id: string; name: string }) {
  editingProcessId.value = p.id;
  processDraft.value = p.name;
}
async function renameProcess(id: string) {
  const { mutate } = useMutation(RENAME_PROCESS);
  if (await processAction(() => mutate({ id, name: processDraft.value.trim() }))) editingProcessId.value = "";
}
async function deleteProcess(id: string) {
  const { mutate } = useMutation(DELETE_PROCESS);
  await processAction(() => mutate({ id }));
}
const { resolveImageUrl } = useImageUrl();
const { uploading, uploadError, uploadFromInput } = useImageUpload();

function details(coffee: CoffeeAdminItem) {
  return [
    coffee.origin,
    coffee.variety,
    coffee.process?.name,
    coffee.altitudeMasl ? `${coffee.altitudeMasl} m` : null,
    coffee.roastLevel ? `tueste ${ROAST_LABELS[coffee.roastLevel]?.toLowerCase()}` : null,
    coffee.tastingNotes.length ? `notas: ${coffee.tastingNotes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function emptyForm() {
  return {
    id: "",
    name: "",
    origin: "",
    variety: "",
    processId: "",
    altitudeMasl: null as number | null | "",
    roastLevel: "",
    tastingNotes: "",
    description: "",
    imageUrl: "",
    available: true,
    presentations: [
      { grams: 250, priceCents: 0, available: true },
      { grams: 500, priceCents: 0, available: true },
    ],
  };
}

const form = reactive(emptyForm());
const formOpen = ref(false);
const saving = ref(false);
const formError = ref("");

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  formOpen.value = true;
}

function startEdit(coffee: CoffeeAdminItem) {
  Object.assign(form, {
    id: coffee.id,
    name: coffee.name,
    origin: coffee.origin ?? "",
    variety: coffee.variety ?? "",
    processId: coffee.process?.id ?? "",
    altitudeMasl: coffee.altitudeMasl,
    roastLevel: coffee.roastLevel ?? "",
    tastingNotes: coffee.tastingNotes.join(", "),
    description: coffee.description ?? "",
    imageUrl: coffee.imageUrl ?? "",
    available: coffee.available,
    // Los tamanos ocultos tambien: al guardar, lo que no se envie se oculta.
    presentations: coffee.presentations.map((p) => ({ ...p })),
  });
  formError.value = "";
  formOpen.value = true;
}

async function handleImageUpload(event: Event) {
  const url = await uploadFromInput(event);
  if (url) form.imageUrl = url;
}

async function submit() {
  saving.value = true;
  formError.value = "";
  try {
    const input = {
      name: form.name.trim(),
      origin: form.origin.trim() || null,
      variety: form.variety.trim() || null,
      processId: form.processId || null,
      // Un <input type="number"> vacio da "" con v-model.number.
      altitudeMasl: typeof form.altitudeMasl === "number" ? form.altitudeMasl : null,
      roastLevel: form.roastLevel || null,
      tastingNotes: form.tastingNotes.split(",").map((n) => n.trim()).filter(Boolean),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      available: form.available,
      presentations: form.presentations.map((p) => ({ grams: p.grams, priceCents: p.priceCents || 0, available: p.available })),
    };
    if (form.id) {
      const { mutate } = useMutation(UPDATE_COFFEE);
      await mutate({ id: form.id, input });
    } else {
      const { mutate } = useMutation(CREATE_COFFEE);
      await mutate({ input });
    }
    await refetch();
    formOpen.value = false;
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar el café";
  } finally {
    saving.value = false;
  }
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.coffee-admin { max-width: 720px; }
.intro { font-size: 14px; margin: 0 0 14px; }
.header { margin-bottom: 14px; }

.coffee-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.coffee-form h3 { margin: 0; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field-inline { display: flex; align-items: center; gap: 8px; }
.field-inline input { width: auto; margin: 0; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }

input[type="text"], input[type="url"], input[type="number"], select, textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.image-preview { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; margin-top: 4px; }

.size-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.size-grams, .size-price { display: flex; align-items: center; gap: 6px; }
.size-grams input { width: 90px; }
.size-price input { width: 120px; }
.add-size { align-self: flex-start; }
.form-actions { display: flex; gap: 8px; }

.coffee-row { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
.coffee-row.unavailable { opacity: 0.6; }
.coffee-info { flex: 1; min-width: 0; }
.coffee-info p { margin: 4px 0 0; }
.thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
.sizes { display: flex; flex-wrap: wrap; gap: 6px; }
.size { font-size: 13px; padding: 2px 8px; border: 1px solid var(--border-strong); border-radius: 999px; }
.size.off { opacity: 0.55; text-decoration: line-through; }

.processes { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--field-border); }
.processes h3 { margin: 0 0 4px; }
.process-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; max-width: 520px; }
.process-name { flex: 1; font-weight: 600; }
.process-row input { flex: 1; }
</style>
