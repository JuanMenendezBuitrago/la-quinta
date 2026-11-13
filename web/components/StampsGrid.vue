<template>
  <!-- Tarjeta de sellos: un querubin por sello hasta los que hacen falta para canjear; los ganados,
       enteros, y los pendientes, tenues. La usan la cuenta del cliente y su ficha en el panel. -->
  <div class="stamps-grid" role="img" :aria-label="`${balance} de ${threshold} sellos`">
    <span v-for="i in threshold" :key="i" class="stamp" :class="{ filled: i <= balance }" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ balance: number; threshold: number }>();
</script>

<style scoped>
.stamps-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 260px; }
/* Cada sello es un querubin (ver --stamp-img en main.css). */
.stamp { width: 24px; height: 34px; background: var(--stamp-img) center / contain no-repeat; opacity: 0.22; }
.stamp.filled { opacity: 1; }
</style>
