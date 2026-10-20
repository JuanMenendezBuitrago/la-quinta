<template>
  <!-- Un boton que pasa por Sistema -> Claro -> Oscuro; el icono muestra el tema elegido -->
  <button
    type="button"
    class="theme-toggle"
    :aria-label="`Tema: ${THEME_LABELS[preference].toLowerCase()}. Cambiar a ${THEME_LABELS[next].toLowerCase()}`"
    :title="`Tema: ${THEME_LABELS[preference]}`"
    @click="cycle"
  >
    <Monitor v-if="preference === 'system'" :size="20" :stroke-width="1.7" aria-hidden="true" />
    <Sun v-else-if="preference === 'light'" :size="20" :stroke-width="1.7" aria-hidden="true" />
    <Moon v-else :size="20" :stroke-width="1.7" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { Monitor, Moon, Sun } from "lucide-vue-next";
import { THEME_LABELS, useTheme } from "~/composables/useTheme";

const { preference, next, cycle } = useTheme();
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.theme-toggle:hover { color: var(--text); background: var(--surface-alt); }
.theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
