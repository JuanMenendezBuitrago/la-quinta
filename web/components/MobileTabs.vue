<template>
  <!-- Pestañas de una seccion del panel: solo en movil y vertical, fijas bajo la barra superior.
       En pantalla ancha apaisada no se muestran (cada seccion decide que se ve alli). -->
  <nav class="mobile-tabs" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      role="tab"
      class="mobile-tab"
      :class="{ active: modelValue === t.id }"
      :aria-selected="modelValue === t.id"
      @click="select(t.id)"
    >
      {{ t.label }}
      <span v-if="t.count != null" class="tab-count">{{ t.count }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
export interface MobileTab {
  id: string;
  label: string;
  /** Numero que se muestra debajo del nombre (opcional). */
  count?: number | null;
}

defineProps<{ tabs: MobileTab[]; modelValue: string; label: string }>();
const emit = defineEmits<{ (e: "update:modelValue", id: string): void }>();

// Al cambiar de pestaña se vuelve arriba: la nueva parte empieza desde su principio.
function select(id: string) {
  emit("update:modelValue", id);
  window.scrollTo({ top: 0 });
}
</script>

<style scoped>
.mobile-tabs {
  position: sticky;
  top: 77px; /* alto de la barra superior en movil */
  z-index: 5;
  display: flex;
  gap: 4px;
  margin: -6px 0 0;
  padding: 2px 0 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}
.mobile-tab {
  /* Numero debajo del nombre: asi caben tres pestañas en 360 px sin cortar "Personalizaciones" */
  flex: 1 0 auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  /* Arriba: si unas pestañas llevan numero y otras no, los nombres quedan a la misma altura */
  justify-content: flex-start;
  gap: 3px;
  min-height: 44px;
  padding: 6px 6px 7px;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.mobile-tab.active { color: var(--accent-strong); border-bottom-color: var(--accent-strong); }
.mobile-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 700;
}
.mobile-tab.active .tab-count { background: var(--accent-strong); color: var(--bg); }
@media (min-width: 1000px) and (orientation: landscape) { .mobile-tabs { display: none; } }
</style>
