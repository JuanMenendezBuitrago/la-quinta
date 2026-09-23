<template>
  <span class="qty-input">
    <input
      v-model="text"
      type="text"
      :inputmode="allowNegative ? 'text' : 'decimal'"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      autocomplete="off"
    />
    <select v-if="units.length > 1" v-model.number="factor" :aria-label="`Unidad de ${ariaLabel}`">
      <option v-for="u in units" :key="u.label" :value="u.factor">{{ u.label }}</option>
    </select>
    <span v-else class="unit">{{ units[0].label }}</span>
  </span>
</template>

<script setup lang="ts">
import { inputUnits, type SupplyUnit } from "~/composables/useInventory";

// Cantidad en la unidad base del insumo (g, ml, ud), tecleada en la unidad que resulte comoda
// (kg, L). Acepta coma decimal. Emite null mientras el texto no sea un numero valido.
const props = withDefaults(
  defineProps<{
    modelValue: number | null | undefined;
    unit: SupplyUnit;
    allowNegative?: boolean;
    placeholder?: string;
    ariaLabel?: string;
  }>(),
  { allowNegative: false, placeholder: "0", ariaLabel: "Cantidad" }
);
const emit = defineEmits<{ (e: "update:modelValue", value: number | null): void }>();

const units = computed(() => inputUnits(props.unit));
// Valor inicial (p. ej. al editar): se muestra en la unidad base, con coma decimal.
const text = ref(props.modelValue != null ? String(props.modelValue).replace(".", ",") : "");
const factor = ref(1);

function parse(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const pattern = props.allowNegative ? /^[-+]?\d*\.?\d+$/ : /^\d*\.?\d+$/;
  if (!pattern.test(clean)) return null;
  return Math.round(Number(clean) * factor.value * 100) / 100;
}

watch([text, factor], () => emit("update:modelValue", parse(text.value)));
// Si el padre lo vacia (p. ej. tras guardar), se vacia tambien el texto.
watch(
  () => props.modelValue,
  (value) => {
    if (value == null && parse(text.value) !== null) text.value = "";
  }
);
watch(
  () => props.unit,
  () => (factor.value = 1)
);
</script>

<style scoped>
.qty-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; min-width: 0; }
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
select { width: auto; padding-right: 6px; }
.unit { color: var(--text-muted); font-size: 14px; padding: 0 4px; }
</style>
