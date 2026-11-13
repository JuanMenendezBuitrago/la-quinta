<template>
  <!-- Tarjeta de sellos: un querubin por sello hasta los que hacen falta para canjear; los ganados,
       enteros, y los pendientes, tenues. La usan la cuenta del cliente y su ficha en el panel.
       Con `animated`, los ganados se van poniendo uno detras de otro (la muestra del login). -->
  <div class="stamps-grid" :class="{ animated }" role="img" :aria-label="`${balance} de ${threshold} sellos`">
    <span
      v-for="i in threshold"
      :key="i"
      class="stamp"
      :class="{ filled: i <= balance }"
      :style="animated ? { animationDelay: `${0.4 + i * 0.18}s` } : undefined"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ balance: number; threshold: number; animated?: boolean }>();
</script>

<style scoped>
.stamps-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 260px; }
/* Cada sello es un querubin (ver --stamp-img en main.css). */
.stamp { width: 24px; height: 34px; background: var(--stamp-img) center / contain no-repeat; opacity: 0.22; }
.stamp.filled { opacity: 1; }

.animated .stamp.filled { animation: stamp-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes stamp-in {
  from { opacity: 0.22; transform: scale(1); }
  55% { opacity: 1; transform: scale(1.35) rotate(-8deg); }
  to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .animated .stamp.filled { animation: none; }
}
</style>
