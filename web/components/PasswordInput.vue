<template>
  <!-- Campo de contraseña con un ojo para verla en claro. Los atributos (id, placeholder,
       autocomplete, required...) van al input, no al contenedor. -->
  <div class="password-input">
    <input ref="input" v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'" />
    <button
      type="button"
      class="toggle"
      :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      :title="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" :size="18" :stroke-width="1.8" aria-hidden="true" />
      <Eye v-else :size="18" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "lucide-vue-next";

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: "" });
const visible = ref(false);
const input = ref<HTMLInputElement | null>(null);

// Para quien necesite enfocarlo (p. ej. el login al elegir cuenta).
defineExpose({ focus: () => input.value?.focus() });
</script>

<style scoped>
.password-input { position: relative; width: 100%; }
/* Sitio a la derecha para el ojo, sin que el texto pase por debajo */
.password-input input { padding-right: 44px; }
.toggle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.toggle:hover { color: var(--text); }
.toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; border-radius: 8px; }
</style>
