<template>
  <!-- Personalizaciones de una linea ya en el ticket o el carrito: cambian toda la linea -->
  <div v-if="singleChoice.length" class="line-options">
    <label v-for="m in singleChoice" :key="m.group.id" class="line-option">
      <span class="muted">{{ m.group.name }}</span>
      <select
        :value="selectedId(m)"
        :class="{ changed: isChanged(m), missing: m.group.minSelect > 0 && !selectedId(m) }"
        @change="change(m, ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="m.group.minSelect === 0" value="">Ninguna{{ m.defaultOptionId ? "" : " (normal)" }}</option>
        <option v-else-if="!selectedId(m)" value="" disabled>Elige…</option>
        <option v-for="o in m.group.options" :key="o.id" :value="o.id">
          {{ o.name }}{{ o.id === m.defaultOptionId ? " (normal)" : "" }}{{ o.priceDeltaCents ? ` +${formatPrice(o.priceDeltaCents)}` : "" }}
        </option>
      </select>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { CartLineOption } from "~/composables/useCart";
import { cartOption, type MenuItemModifier } from "~/composables/useMenu";

const props = defineProps<{ modifiers: MenuItemModifier[]; options: CartLineOption[] }>();
const emit = defineEmits<{ (e: "change", options: CartLineOption[]): void }>();

// Grupos de una opcion como maximo: obligatorios (Leche) u opcionales (Adicion, con "Ninguna").
// Los de varias opciones se elegiran con casillas cuando existan.
const singleChoice = computed(() => props.modifiers.filter((m) => m.group.maxSelect === 1));

function selectedId(m: MenuItemModifier) {
  return props.options.find((o) => o.groupId === m.group.id)?.id ?? "";
}
function isChanged(m: MenuItemModifier) {
  return selectedId(m) !== (m.defaultOptionId ?? "");
}
function change(m: MenuItemModifier, optionId: string) {
  const others = props.options.filter((o) => o.groupId !== m.group.id);
  // "" = ninguna (solo en las opcionales)
  const option = optionId ? cartOption(m, optionId) : null;
  emit("change", option ? [...others, option] : others);
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.line-options { display: flex; flex-direction: column; gap: 6px; }
.line-option { display: flex; align-items: center; gap: 10px; }
.line-option select {
  flex: 1;
  min-width: 0;
  width: auto;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}
/* Lo que cambia respecto a la receta, bien visible (como luego en la cola) */
.line-option select.changed { border: 2px solid var(--accent); font-weight: 700; }
.line-option select.missing { border: 2px solid var(--danger); }
</style>
