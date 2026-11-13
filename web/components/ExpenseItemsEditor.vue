<template>
  <div class="items-editor">
    <p class="muted progress" aria-live="polite">
      Desglosado {{ format(itemsCents) }} de {{ format(expense.amountCents) }}
      <template v-if="overCents > 0"> · <strong class="over">se pasa {{ format(overCents) }}</strong></template>
      <template v-else-if="leftCents > 0"> · falta {{ format(leftCents) }}</template>
      <template v-else> · <strong class="done">completo</strong></template>
    </p>

    <ul class="rows">
      <li v-for="(row, i) in rows" :key="row.key" class="row">
        <label class="name">
          <span class="vh">Artículo {{ i + 1 }}</span>
          <input
            :ref="(el) => (nameInputs[i] = el as HTMLInputElement | null)"
            v-model="row.name"
            type="text"
            maxlength="120"
            placeholder="Artículo"
          />
        </label>
        <label class="qty">
          <span class="vh">Cantidad de {{ row.name || `el artículo ${i + 1}` }}</span>
          <input v-model.number="row.quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Cant." />
        </label>
        <label class="amount">
          <span class="vh">Importe de {{ row.name || `el artículo ${i + 1}` }}</span>
          <!-- Enter en el importe de la ultima fila abre otra: se dicta el ticket de corrido -->
          <input
            v-model.number="row.amount"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="Importe"
            @keydown.enter.prevent="i === rows.length - 1 && addRow()"
          />
        </label>
        <button type="button" class="icon-btn danger" :aria-label="`Quitar ${row.name || `el artículo ${i + 1}`}`" title="Quitar" @click="rows.splice(i, 1)">
          <X :size="16" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <div class="row-actions">
      <button type="button" class="button secondary" @click="addRow()">
        <Plus :size="16" :stroke-width="1.8" aria-hidden="true" />
        Añadir artículo
      </button>
      <button v-if="leftCents > 0" type="button" class="link-button" @click="addRest">
        Poner lo que falta como «Varios»
      </button>
    </div>

    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
    <div class="actions">
      <button class="button" type="button" :disabled="saving || !valid" @click="save">
        <Check :size="16" :stroke-width="2" aria-hidden="true" />
        {{ saving ? "Guardando…" : "Guardar desglose" }}
      </button>
      <button class="button secondary cancel" type="button" :disabled="saving" @click="emit('cancel')">
        <X :size="16" :stroke-width="1.8" aria-hidden="true" />
        Cancelar
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Check, Plus, X } from "lucide-vue-next";
import { EXPENSE_FIELDS, type Expense } from "~/composables/useExpenses";

const props = defineProps<{ expense: Expense; format: (cents: number) => string }>();
const emit = defineEmits<{ (e: "saved", expense: Expense): void; (e: "cancel"): void }>();

const SET_ITEMS = gql`
  mutation SetExpenseItems($id: ID!, $items: [ExpenseItemInput!]!) {
    setExpenseItems(id: $id, items: $items) { ${EXPENSE_FIELDS} }
  }
`;

interface Row {
  key: number;
  name: string;
  quantity: number | "";
  amount: number | "";
}
let nextKey = 0;
const toRow = (name = "", quantity: number | "" = "", amount: number | "" = ""): Row => ({ key: nextKey++, name, quantity, amount });

const rows = ref<Row[]>(
  props.expense.items.length
    ? props.expense.items.map((i) => toRow(i.name, i.quantity ?? "", i.amountCents))
    : [toRow()],
);
const nameInputs = ref<(HTMLInputElement | null)[]>([]);

// Las filas del todo vacias no cuentan (la ultima que se abre y no se usa, por ejemplo).
const filled = computed(() => rows.value.filter((r) => r.name.trim() !== "" || r.amount !== "" || r.quantity !== ""));
const itemsCents = computed(() => filled.value.reduce((sum, r) => sum + (typeof r.amount === "number" ? Math.round(r.amount) : 0), 0));
const leftCents = computed(() => Math.max(0, props.expense.amountCents - itemsCents.value));
const overCents = computed(() => Math.max(0, itemsCents.value - props.expense.amountCents));
const valid = computed(
  () =>
    overCents.value === 0 &&
    filled.value.every(
      (r) => r.name.trim() !== "" && typeof r.amount === "number" && r.amount >= 1 && (r.quantity === "" || r.quantity > 0),
    ),
);

async function addRow(row = toRow()) {
  rows.value.push(row);
  await nextTick();
  nameInputs.value[rows.value.length - 1]?.focus();
}
function addRest() {
  // Reutiliza la ultima fila si esta vacia.
  const last = rows.value[rows.value.length - 1];
  const rest = leftCents.value;
  if (last && !last.name.trim() && last.amount === "" && last.quantity === "") {
    last.name = "Varios";
    last.amount = rest;
  } else {
    rows.value.push(toRow("Varios", "", rest));
  }
}

const { mutate } = useMutation(SET_ITEMS);
const saving = ref(false);
const error = ref("");

async function save() {
  if (!valid.value) return;
  saving.value = true;
  error.value = "";
  try {
    const items = filled.value.map((r) => ({
      name: r.name.trim(),
      quantity: r.quantity === "" ? null : r.quantity,
      amountCents: Math.round(r.amount as number),
    }));
    const result = await mutate({ id: props.expense.id, items });
    if (result?.data?.setExpenseItems) emit("saved", result.data.setExpenseItems);
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar el desglose";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.items-editor { display: flex; flex-direction: column; gap: 10px; flex-basis: 100%; }
.progress { margin: 0; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.progress .over { color: var(--danger); }
.progress .done { color: var(--accent-strong); }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) 72px 110px 34px; gap: 6px; align-items: center; }
.row input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
}
.qty input, .amount input { font-variant-numeric: tabular-nums; }
.row-actions, .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--field-border);
  border-radius: 50%;
  background: none;
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn.danger { color: var(--danger); }
.icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
.error { color: var(--danger); margin: 0; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
