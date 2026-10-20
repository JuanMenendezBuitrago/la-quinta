<template>
  <!-- list: un producto por fila (tarjetas de la cola) -->
  <ul v-if="list" class="muted order-items order-items--list">
    <li v-for="(item, i) in items" :key="i">
      {{ item.quantity }}× {{ item.name
      }}<strong v-if="changedOptions(item).length" class="changed"> · {{ changedOptions(item).join(", ") }}</strong>
    </li>
  </ul>
  <!-- "2× Latte, 1× Latte · Avena": solo se destacan las opciones que cambian la receta -->
  <p v-else class="muted order-items">
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

defineProps<{ items: OrderItem[]; list?: boolean }>();

function changedOptions(item: OrderItem) {
  return (item.options ?? []).filter((o) => !o.isDefault).map((o) => o.name);
}
</script>

<style scoped>
.changed { color: var(--accent); }
.order-items--list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 2px; }
</style>
