<template>
  <div ref="root" class="segmented" :class="{ ready: indicator.ready, animate }" role="tablist" :aria-label="ariaLabel">
    <!-- Selector de dos o mas vistas (Semana / Dia, Datos / Actividad...). Una "pastilla" se desliza
         bajo la opcion elegida. Hasta medirla (en SSR o antes de montar), la opcion elegida lleva el
         fondo ella misma, asi que se ve bien sin JavaScript. -->
    <span
      class="indicator"
      aria-hidden="true"
      :style="{ transform: `translate(${indicator.left}px, ${indicator.top}px)`, width: `${indicator.width}px`, height: `${indicator.height}px` }"
    />
    <button
      v-for="option in options"
      :key="option.value"
      :ref="(el) => setButton(option.value, el as HTMLElement | null)"
      type="button"
      role="tab"
      :aria-selected="modelValue === option.value"
      :class="{ on: modelValue === option.value }"
      @click="emit('update:modelValue', option.value)"
    >
      <component :is="option.icon" v-if="option.icon" :size="16" :stroke-width="1.8" aria-hidden="true" />
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import type { Component } from "vue";

const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; icon?: Component }[];
  ariaLabel?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const root = ref<HTMLElement | null>(null);
const buttons = new Map<string, HTMLElement>();
function setButton(value: string, el: HTMLElement | null) {
  if (el) buttons.set(value, el);
  else buttons.delete(value);
}

const indicator = reactive({ left: 0, top: 0, width: 0, height: 0, ready: false });
// La primera colocacion va sin animar: la pastilla aparece ya en su sitio.
const animate = ref(false);

function measure() {
  const el = buttons.get(props.modelValue);
  if (!el) return;
  indicator.left = el.offsetLeft;
  indicator.top = el.offsetTop;
  indicator.width = el.offsetWidth;
  indicator.height = el.offsetHeight;
  indicator.ready = true;
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  measure();
  requestAnimationFrame(() => { animate.value = true; });
  // Cambia el ancho de las opciones si cambia la letra (fuentes que cargan tarde) o el contenedor
  if (typeof ResizeObserver !== "undefined" && root.value) {
    observer = new ResizeObserver(() => measure());
    observer.observe(root.value);
    buttons.forEach((b) => observer!.observe(b));
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.modelValue, () => nextTick(measure));
</script>

<style scoped>
.segmented {
  position: relative;
  display: inline-flex;
  align-self: flex-start;
  flex-wrap: wrap;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  isolation: isolate;
}
.indicator {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  border-radius: 7px;
  background: var(--accent-soft);
  opacity: 0;
}
.segmented.ready .indicator { opacity: 1; }
.segmented.animate .indicator {
  transition: transform 0.28s cubic-bezier(0.3, 0.7, 0.2, 1), width 0.28s cubic-bezier(0.3, 0.7, 0.2, 1), height 0.28s cubic-bezier(0.3, 0.7, 0.2, 1);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}
button:hover:not(.on) { color: var(--text); }
button:active { transform: scale(0.97); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button.on { color: var(--on-accent-soft); }
/* Sin medir aun: la opcion elegida lleva el fondo (luego lo pone la pastilla) */
.segmented:not(.ready) button.on { background: var(--accent-soft); }

@media (prefers-reduced-motion: reduce) {
  .segmented.animate .indicator, button { transition: none; }
  button:active { transform: none; }
}
</style>
