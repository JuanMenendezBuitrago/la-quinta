<template>
  <!-- Pestañas de una seccion del panel: solo en movil y vertical, fijas bajo la barra superior.
       En pantalla ancha apaisada no se muestran (cada seccion decide que se ve alli). -->
  <nav ref="nav" class="mobile-tabs" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.id"
      :ref="(el) => setTabEl(t.id, el as HTMLElement | null)"
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
    <!-- Subrayado de la pestaña activa: una sola barra que se desliza de una pestaña a otra -->
    <span class="tab-indicator" :class="{ animated }" :style="indicatorStyle" aria-hidden="true" />
  </nav>
</template>

<script setup lang="ts">
export interface MobileTab {
  id: string;
  label: string;
  /** Numero que se muestra debajo del nombre (opcional). */
  count?: number | null;
}

const props = defineProps<{ tabs: MobileTab[]; modelValue: string; label: string }>();
const emit = defineEmits<{ (e: "update:modelValue", id: string): void }>();

const nav = ref<HTMLElement | null>(null);
const tabEls = new Map<string, HTMLElement>();
const indicator = ref({ left: 0, width: 0 });
// Sin transicion hasta la primera colocacion: si no, al montar la barra entraria deslizandose desde la izquierda.
const animated = ref(false);
const indicatorStyle = computed(() => ({
  width: `${indicator.value.width}px`,
  transform: `translateX(${indicator.value.left}px)`,
  opacity: indicator.value.width ? 1 : 0,
}));

function setTabEl(id: string, el: HTMLElement | null) {
  if (el) tabEls.set(id, el);
  else tabEls.delete(id);
}

function placeIndicator() {
  const el = tabEls.get(props.modelValue);
  indicator.value = el ? { left: el.offsetLeft, width: el.offsetWidth } : { left: 0, width: 0 };
}

watch(
  () => props.modelValue,
  async (id) => {
    await nextTick();
    placeIndicator();
    // Si las pestañas no caben y la activa queda fuera, se trae a la vista.
    tabEls.get(id)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
);
// Los numeros de las pestañas cambian su ancho: se recoloca la barra.
watch(() => props.tabs, () => nextTick(placeIndicator), { deep: true });

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  placeIndicator();
  requestAnimationFrame(() => (animated.value = true));
  resizeObserver = new ResizeObserver(placeIndicator);
  if (nav.value) resizeObserver.observe(nav.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

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
  transition: color 0.25s ease;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.mobile-tab.active { color: var(--accent-strong); }
.tab-indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--accent-strong);
  pointer-events: none;
}
.tab-indicator.animated { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.mobile-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 700;
  transition: background-color 0.25s ease, color 0.25s ease;
}
.mobile-tab.active .tab-count { background: var(--accent-strong); color: var(--bg); }
@media (prefers-reduced-motion: reduce) {
  .mobile-tab, .tab-count, .tab-indicator.animated { transition: none; }
}
@media (min-width: 1000px) and (orientation: landscape) { .mobile-tabs { display: none; } }
</style>
