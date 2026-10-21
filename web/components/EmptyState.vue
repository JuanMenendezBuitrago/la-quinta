<template>
  <!-- Mensaje de "no hay nada" (o "nada coincide"): icono, titulo y, opcional, una pista debajo.
       compact: dentro de una ficha o tarjeta, en una linea y sin recuadro. -->
  <div class="empty-state" :class="{ 'empty-state--compact': compact }" role="status">
    <span class="empty-icon" aria-hidden="true">
      <component :is="icon" :size="compact ? 18 : 26" :stroke-width="1.6" />
    </span>
    <div class="empty-text">
      <p class="empty-title">{{ title }}</p>
      <p v-if="$slots.default" class="empty-hint"><slot /></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component; title: string; compact?: boolean }>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  border: 1.5px dashed var(--field-border);
  border-radius: 12px;
  text-align: center;
  color: var(--text);
}
.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-strong);
}
.empty-text { display: flex; flex-direction: column; gap: 4px; max-width: 42ch; }
.empty-title { margin: 0; font-family: var(--font-futura-text); font-size: 17px; font-weight: 700; }
.empty-hint { margin: 0; font-size: 14px; color: var(--text-muted); }
.empty-hint :deep(a) { color: var(--accent-strong); }

.empty-state--compact {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border: none;
  text-align: left;
}
.empty-state--compact .empty-icon { width: 32px; height: 32px; flex-shrink: 0; }
.empty-state--compact .empty-title { font-family: inherit; font-size: 14.5px; font-weight: 600; }
.empty-state--compact .empty-hint { font-size: 13px; }
</style>
