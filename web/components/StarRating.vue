<template>
  <!-- Solo lectura: estrellas como imagen con su texto ("4 de 5 estrellas") -->
  <span v-if="display" class="stars" role="img" :aria-label="`${modelValue} de 5 estrellas`">
    <Star
      v-for="i in 5"
      :key="i"
      :size="size"
      :stroke-width="1.8"
      class="star"
      :class="{ filled: i <= modelValue }"
      aria-hidden="true"
    />
  </span>
  <!-- Editable: un grupo de radios (flechas del teclado o clic) -->
  <span v-else class="stars" role="radiogroup" :aria-label="label">
    <button
      v-for="i in 5"
      :key="i"
      type="button"
      role="radio"
      class="star-btn"
      :aria-checked="modelValue === i"
      :aria-label="`${i} ${i === 1 ? 'estrella' : 'estrellas'}`"
      :tabindex="modelValue === i || (!modelValue && i === 1) ? 0 : -1"
      @click="emit('update:modelValue', i)"
      @keydown.right.prevent="emit('update:modelValue', Math.min(5, (modelValue || 0) + 1))"
      @keydown.left.prevent="emit('update:modelValue', Math.max(1, (modelValue || 2) - 1))"
    >
      <Star :size="size" :stroke-width="1.8" class="star" :class="{ filled: i <= modelValue }" aria-hidden="true" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { Star } from "lucide-vue-next";

withDefaults(defineProps<{ modelValue: number; display?: boolean; size?: number; label?: string }>(), {
  display: false,
  size: 22,
  label: "Puntuación",
});
const emit = defineEmits<{ (e: "update:modelValue", value: number): void }>();
</script>

<style scoped>
.stars { display: inline-flex; align-items: center; gap: 2px; }
.star { color: var(--text-muted); }
.star.filled { color: var(--color5); fill: var(--color5); }
.star-btn { border: none; background: none; padding: 2px; cursor: pointer; border-radius: 4px; display: inline-flex; }
.star-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
