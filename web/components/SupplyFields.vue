<template>
  <div class="supply-fields">
    <label class="field">
      <span class="muted">Nombre</span>
      <input :value="modelValue.name" type="text" maxlength="60" placeholder="Ej. Café en grano Finca X" @input="set('name', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="field">
      <span class="muted">Categoría</span>
      <input
        :value="modelValue.category"
        type="text"
        maxlength="40"
        list="supply-categories"
        placeholder="Ej. Café, Lácteos, Desechables"
        @input="set('category', ($event.target as HTMLInputElement).value)"
      />
      <datalist id="supply-categories">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </label>
    <label class="field">
      <span class="muted">Se mide en</span>
      <select :value="modelValue.unit" @change="set('unit', ($event.target as HTMLSelectElement).value as SupplyUnit)">
        <option v-for="(label, unit) in UNIT_LABELS" :key="unit" :value="unit">{{ label }}</option>
      </select>
    </label>
    <label class="field">
      <span class="muted">Avisar cuando queden (mínimo)</span>
      <QtyInput :key="modelValue.unit" :model-value="modelValue.minStock" :unit="modelValue.unit" aria-label="Stock mínimo" @update:model-value="set('minStock', $event)" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { UNIT_LABELS, type SupplyForm, type SupplyUnit } from "~/composables/useInventory";
import QtyInput from "~/components/QtyInput.vue";

const props = defineProps<{ modelValue: SupplyForm; categories: string[] }>();
const emit = defineEmits<{ (e: "update:modelValue", value: SupplyForm): void }>();

// Copia sincrona del ultimo valor emitido: si cambian dos campos antes de que el padre vuelva a
// pasar la prop (p. ej. autocompletado del navegador), el segundo no pisa al primero.
let latest = props.modelValue;
watch(
  () => props.modelValue,
  (value) => (latest = value)
);

function set<K extends keyof SupplyForm>(key: K, value: SupplyForm[K]) {
  latest = { ...latest, [key]: value };
  emit("update:modelValue", latest);
}
</script>

<style scoped>
.supply-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 520px) { .supply-fields { grid-template-columns: minmax(0, 1fr); } }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
input, select {
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
</style>
