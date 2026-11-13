<template>
  <form class="expense-form" @submit.prevent="save">
    <!-- Atajos para apuntar rapido una compra por su total y desglosarla despues -->
    <div v-if="!existing" class="field">
      <span class="muted" :id="`${uid}-presets`">Gasto agrupado</span>
      <div class="chips" role="group" :aria-labelledby="`${uid}-presets`">
        <button
          v-for="p in GROUPED_PRESETS"
          :key="p.description"
          type="button"
          class="chip"
          :class="{ active: grouped && description === p.description }"
          :aria-pressed="grouped && description === p.description"
          @click="applyPreset(p)"
        >
          <ShoppingBasket :size="14" :stroke-width="1.8" aria-hidden="true" />
          {{ p.description }}
        </button>
      </div>
    </div>

    <div class="row">
      <label class="field">
        <span class="muted">Importe</span>
        <!-- step 1: con min 1 y step 50 el navegador solo aceptaria 1, 51, 101... -->
        <input v-model.number="amount" type="number" min="1" step="1" inputmode="numeric" required />
      </label>
      <label class="field">
        <span class="muted">Fecha</span>
        <input v-model="spentAt" type="datetime-local" required />
      </label>
    </div>

    <div class="field">
      <span class="muted" :id="`${uid}-method`">Pagado con</span>
      <div class="chips" role="radiogroup" :aria-labelledby="`${uid}-method`">
        <button
          v-for="(label, m) in EXPENSE_METHOD_LABELS"
          :key="m"
          type="button"
          role="radio"
          class="chip"
          :class="{ active: method === m }"
          :aria-checked="method === m"
          @click="method = m"
        >
          {{ label }}
        </button>
      </div>
      <span class="muted hint">
        {{ method === "CAJA" ? "Sale del cajón: se resta de lo que debería haber en el arqueo." : "No sale del cajón: cuenta para el resultado, no para el arqueo." }}
      </span>
    </div>

    <div class="row">
      <label class="field">
        <span class="muted">Categoría</span>
        <select v-model="category">
          <option v-for="(label, c) in EXPENSE_CATEGORY_LABELS" :key="c" :value="c">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span class="muted">Proveedor (opcional)</span>
        <!-- Se autocompleta con los proveedores de gastos anteriores mientras se escribe -->
        <input v-model="supplier" type="text" maxlength="80" autocomplete="off" :list="`${uid}-suppliers`" />
        <datalist :id="`${uid}-suppliers`">
          <option v-for="name in suppliers" :key="name" :value="name" />
        </datalist>
      </label>
    </div>

    <label class="field">
      <span class="muted">Descripción</span>
      <input v-model="description" type="text" maxlength="200" required placeholder="P. ej. 2 bolsas de hielo" />
    </label>

    <label class="check">
      <input v-model="grouped" type="checkbox" />
      <span>
        Varios artículos: desglosar más tarde
        <span class="muted hint">Se apunta el total ahora y los artículos cuando haya tiempo, aunque la caja ya esté cerrada.</span>
      </span>
    </label>

    <div class="field">
      <span class="muted">Foto del recibo (opcional)</span>
      <div class="receipt">
        <img v-if="receiptUrl" :src="resolveImageUrl(receiptUrl) ?? undefined" alt="Recibo" class="receipt-thumb" />
        <label class="button secondary upload" :class="{ disabled: uploading }">
          <Camera :size="16" :stroke-width="1.8" aria-hidden="true" />
          {{ uploading ? "Subiendo…" : receiptUrl ? "Cambiar foto" : "Subir foto" }}
          <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" @change="uploadReceipt" />
        </label>
        <button v-if="receiptUrl" type="button" class="link-button" @click="receiptUrl = null">Quitar</button>
      </div>
    </div>

    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
    <div class="actions">
      <button class="button" type="submit" :disabled="saving || uploading || !valid">
        <Check :size="16" :stroke-width="2" aria-hidden="true" />
        {{ saving ? "Guardando…" : existing ? "Guardar cambios" : "Añadir gasto" }}
      </button>
      <button class="button secondary cancel" type="button" :disabled="saving" @click="emit('cancel')">
        <X :size="16" :stroke-width="1.8" aria-hidden="true" />
        Cancelar
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { shrinkImage } from "~/composables/useImageResize";
import { gql } from "graphql-tag";
import { Camera, Check, ShoppingBasket, X } from "lucide-vue-next";
import { useImageUrl } from "~/composables/useImageUrl";
import { useStoreTime } from "~/composables/useStoreTime";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_FIELDS,
  EXPENSE_METHOD_LABELS,
  GROUPED_PRESETS,
  type Expense,
  type ExpenseCategory,
  type ExpenseMethod,
} from "~/composables/useExpenses";

const props = defineProps<{ existing?: Expense | null }>();
const emit = defineEmits<{ (e: "saved", expense: Expense): void; (e: "cancel"): void }>();

const CREATE = gql`
  mutation CreateExpense($input: ExpenseInput!) {
    createExpense(input: $input) { ${EXPENSE_FIELDS} }
  }
`;
const SUPPLIERS = gql`
  query ExpenseSuppliers {
    expenseSuppliers
  }
`;
const UPDATE = gql`
  mutation UpdateExpense($id: ID!, $input: ExpenseInput!) {
    updateExpense(id: $id, input: $input) { ${EXPENSE_FIELDS} }
  }
`;

const uid = useId();
const { toStoreInput, fromStoreInput } = useStoreTime();
const { resolveImageUrl } = useImageUrl();
const config = useRuntimeConfig();
const token = useCookie("lq_auth_token");

const amount = ref<number | "">(props.existing?.amountCents ?? "");
const method = ref<ExpenseMethod>(props.existing?.method ?? "CAJA");
const category = ref<ExpenseCategory>(props.existing?.category ?? "INSUMOS");
const description = ref(props.existing?.description ?? "");
const supplier = ref(props.existing?.supplier ?? "");
const spentAt = ref(toStoreInput(props.existing ? new Date(props.existing.spentAt) : new Date()));
const receiptUrl = ref<string | null>(props.existing?.receiptUrl ?? null);
const grouped = ref(props.existing?.grouped ?? false);

function applyPreset(p: (typeof GROUPED_PRESETS)[number]) {
  description.value = p.description;
  category.value = p.category;
  grouped.value = true;
}

const valid = computed(() => typeof amount.value === "number" && amount.value >= 1 && description.value.trim() !== "");

// Proveedores ya usados, para el autocompletado (de la cache al momento; se refrescan detras).
const { result: suppliersResult } = useQuery<{ expenseSuppliers: string[] }>(SUPPLIERS, null, {
  fetchPolicy: "cache-and-network",
});
const suppliers = computed(() => suppliersResult.value?.expenseSuppliers ?? []);

const { mutate: create } = useMutation(CREATE);
const { mutate: update } = useMutation(UPDATE);
const saving = ref(false);
const uploading = ref(false);
const error = ref("");

async function save() {
  if (!valid.value) return;
  saving.value = true;
  error.value = "";
  const input = {
    amountCents: Math.round(amount.value as number),
    method: method.value,
    category: category.value,
    description: description.value.trim(),
    supplier: supplier.value.trim() || null,
    receiptUrl: receiptUrl.value,
    grouped: grouped.value,
    spentAt: fromStoreInput(spentAt.value).toISOString(),
  };
  try {
    const result = props.existing ? await update({ id: props.existing.id, input }) : await create({ input });
    const saved = result?.data?.updateExpense ?? result?.data?.createExpense;
    if (saved) emit("saved", saved);
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar el gasto";
  } finally {
    saving.value = false;
  }
}

async function uploadReceipt(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  error.value = "";
  try {
    const body = new FormData();
    // Lado mayor 1600 px: legible y ligero, y sin los EXIF (ubicacion, etc.).
    body.append("file", await shrinkImage(file), "recibo.jpg");
    const uploadsBase = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
    const res = await fetch(`${uploadsBase}/uploads/receipt`, {
      method: "POST",
      headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la foto");
    receiptUrl.value = data.url;
  } catch (err: any) {
    error.value = err instanceof DOMException ? "No se pudo abrir esa imagen. Prueba con una JPG o PNG." : err?.message ?? "No se pudo subir la foto";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}
</script>

<style scoped>
.expense-form { display: flex; flex-direction: column; gap: 12px; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* Proveedor: las sugerencias salen al escribir; sin la flecha de Chrome, que lo hace parecer un desplegable */
input[list]::-webkit-calendar-picker-indicator { display: none !important; }
.field input, .field select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
}
.hint { font-size: 12.5px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--field-border);
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip { display: inline-flex; align-items: center; gap: 6px; }
.check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.check input { width: 20px; height: 20px; margin: 1px 0 0; accent-color: var(--accent); flex-shrink: 0; }
.check > span { display: flex; flex-direction: column; gap: 2px; }
.chip.active { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
.chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.receipt { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.receipt-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid var(--field-border); }
.upload { position: relative; }
.upload.disabled { opacity: 0.45; cursor: not-allowed; }
.upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.upload:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.error { color: var(--danger); margin: 0; }
</style>
