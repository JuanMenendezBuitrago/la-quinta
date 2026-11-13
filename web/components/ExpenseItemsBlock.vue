<template>
  <!-- Desglose de un gasto agrupado: lo que lleva desglosado, lo que falta y el editor -->
  <div v-if="expense.grouped || expense.items.length" class="items-block">
    <ExpenseItemsEditor v-if="editing" :expense="expense" :format="format" @saved="onSaved" @cancel="editing = false" />
    <template v-else>
      <div class="items-head">
        <span v-if="expense.unitemizedCents > 0" class="pending-badge">
          <ListTodo :size="13" :stroke-width="2" aria-hidden="true" />
          {{ expense.items.length ? `Falta desglosar ${format(expense.unitemizedCents)}` : "Por desglosar" }}
        </span>
        <button type="button" class="link-button" @click="editing = true">
          {{ expense.items.length ? "Editar desglose" : "Desglosar artículos" }}
        </button>
      </div>
      <details v-if="expense.items.length" class="items">
        <summary>{{ expense.items.length }} {{ expense.items.length === 1 ? "artículo" : "artículos" }}</summary>
        <ul>
          <li v-for="(item, i) in expense.items" :key="i">
            <span class="item-name">
              <template v-if="item.quantity != null">{{ formatQty(item.quantity) }} × </template>{{ item.name }}
            </span>
            <span class="item-amount">{{ format(item.amountCents) }}</span>
          </li>
        </ul>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ListTodo } from "lucide-vue-next";
import ExpenseItemsEditor from "~/components/ExpenseItemsEditor.vue";
import type { Expense } from "~/composables/useExpenses";

defineProps<{ expense: Expense; format: (cents: number) => string }>();
const emit = defineEmits<{ (e: "saved", expense: Expense): void }>();

const editing = ref(false);
function onSaved(expense: Expense) {
  editing.value = false;
  emit("saved", expense);
}
function formatQty(q: number) {
  return q.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}
</script>

<style scoped>
.items-block { flex-basis: 100%; display: flex; flex-direction: column; gap: 6px; }
.items-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pending-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--field-border);
  background: var(--surface-alt);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.items summary { cursor: pointer; font-size: 13.5px; color: var(--text-muted); }
.items ul { list-style: none; margin: 6px 0 0; padding: 0 0 0 14px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
.items li { display: flex; justify-content: space-between; gap: 12px; }
.item-name { min-width: 0; overflow-wrap: anywhere; }
.item-amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
