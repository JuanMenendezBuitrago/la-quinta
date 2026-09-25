<template>
  <!-- "2× Latte, 1× Latte · Avena": solo se destacan las opciones que cambian la receta -->
  <p class="muted order-items">
    <template v-for="(item, i) in items" :key="i">
      <span v-if="i">, </span>{{ item.quantity }}× {{ item.name
      }}<strong v-if="changedOptions(item).length" class="changed"> · {{ changedOptions(item).join(", ") }}</strong>
    </template>
  </p>
</template>

<script setup lang="ts">
interface OrderItem {
  name: string;
  quantity: number;
  options?: { name: string; isDefault: boolean }[];
}

defineProps<{ items: OrderItem[] }>();

function changedOptions(item: OrderItem) {
  return (item.options ?? []).filter((o) => !o.isDefault).map((o) => o.name);
}
</script>

<style scoped>
.changed { color: var(--accent); }
</style>
