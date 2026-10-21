<template>
  <form class="expense-form" @submit.prevent="save">
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
        <input v-model="supplier" type="text" maxlength="80" />
      </label>
    </div>

    <label class="field">
      <span class="muted">Descripción</span>
      <input v-model="description" type="text" maxlength="200" required placeholder="P. ej. 2 bolsas de hielo" />
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
        <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
        Cancelar
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Camera, Check, Trash2 } from "lucide-vue-next";
import { useImageUrl } from "~/composables/useImageUrl";
import { useStoreTime } from "~/composables/useStoreTime";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_FIELDS,
  EXPENSE_METHOD_LABELS,
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

const valid = computed(() => typeof amount.value === "number" && amount.value >= 1 && description.value.trim() !== "");

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

/** Lado mayor del recibo: legible y ligero. Al redibujarla se pierden los EXIF (ubicacion, etc.). */
const RECEIPT_MAX_SIDE = 1600;
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return blob;
}

async function uploadReceipt(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  error.value = "";
  try {
    const body = new FormData();
    body.append("file", await shrink(file), "recibo.jpg");
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
