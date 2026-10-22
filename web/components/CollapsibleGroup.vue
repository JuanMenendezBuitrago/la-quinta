<template>
  <!-- Grupo plegable (acordeon): el titulo entero, con el chevron a la derecha, lo abre y cierra.
       El contenido se oculta con v-show: lo que haya escrito dentro se conserva al plegarlo. -->
  <section class="group">
    <h3 class="group-title">
      <button type="button" class="group-toggle" :aria-expanded="open" :aria-controls="contentId" @click="emit('update:open', !open)">
        <span class="group-name">{{ title }}</span>
        <span v-if="$slots.meta" class="group-meta"><slot name="meta" /></span>
        <ChevronDown class="group-chevron" :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
    </h3>
    <div v-show="open" :id="contentId">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

defineProps<{ title: string; open: boolean }>();
const emit = defineEmits<{ (e: "update:open", open: boolean): void }>();
const contentId = useId();
</script>

<style scoped>
.group { margin-bottom: 4px; }
.group-title { margin: 0; }
.group-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
}
.group-toggle:hover { color: var(--text); }
.group-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.group-name { min-width: 0; overflow-wrap: anywhere; }
.group-meta { font-weight: 600; letter-spacing: 0; text-transform: none; white-space: nowrap; }
.group-chevron { flex-shrink: 0; margin-left: auto; transition: transform 0.2s ease; }
.group-toggle[aria-expanded="true"] .group-chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .group-chevron { transition: none; } }
</style>
