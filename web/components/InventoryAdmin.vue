<template>
  <section class="inventory">
    <nav class="chips" aria-label="Vistas del inventario">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        class="chip"
        :class="{ active: activeView === view.id }"
        @click="activeView = view.id"
      >
        {{ view.label }}
      </button>
    </nav>

    <InventoryStock v-if="activeView === 'stock'" :is-gestion="isGestion" />
    <InventoryCount v-else-if="activeView === 'conteo'" />
    <InventoryRecipes v-else-if="activeView === 'recetas' && isGestion" />
  </section>
</template>

<script setup lang="ts">
import { useStaffAuth } from "~/composables/useAuth";
import InventoryStock from "~/components/InventoryStock.vue";
import InventoryCount from "~/components/InventoryCount.vue";
import InventoryRecipes from "~/components/InventoryRecipes.vue";

// Barra registra lo que pasa en el dia a dia (entradas, mermas, conteos); Gestion ademas da de
// alta los insumos, define las recetas y hace ajustes. La API aplica lo mismo en cada mutacion.
const { staff } = useStaffAuth();
const isGestion = computed(() => staff.value?.role === "gestion");

const views = computed(() => [
  { id: "stock", label: "Stock" },
  { id: "conteo", label: "Conteo" },
  ...(isGestion.value ? [{ id: "recetas", label: "Recetas" }] : []),
]);
const activeView = ref("stock");
</script>

<style scoped>
.inventory { max-width: 760px; }
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 14px; }
.chip {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
</style>
