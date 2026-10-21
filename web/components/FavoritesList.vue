<template>
  <div class="favorites">
    <EmptyState v-if="!favorites.length" :icon="Heart" title="Todavía no tienes favoritos">
      Márcalos con el corazón en la <NuxtLink to="/">carta</NuxtLink>.
    </EmptyState>
    <ul v-else class="favorite-list">
      <li v-for="item in favorites" :key="item.id" class="favorite-row">
        <img
          v-if="item.imageUrl"
          :src="resolveImageUrl(item.imageUrl) ?? undefined"
          alt=""
          class="favorite-thumb"
        />
        <span v-else class="favorite-thumb favorite-thumb--empty" aria-hidden="true" />
        <div class="favorite-info">
          <span class="favorite-name">{{ item.name }}</span>
          <span class="favorite-price price">{{ item.sizes ? "desde " : "" }}{{ formatPrice(item.priceCents) }}</span>
        </div>
        <!-- Un cafe con varios tamaños se añade desde la carta, donde se elige el tamaño -->
        <button
          v-if="canOrder && !item.sizes"
          class="button secondary add"
          type="button"
          :aria-label="`Añadir ${item.name} al pedido`"
          @click="addToCart(item)"
        >
          {{ addedId === item.id ? "Añadido ✓" : "Añadir" }}
        </button>
        <button
          class="unfav"
          type="button"
          aria-pressed="true"
          :aria-label="`Quitar ${item.name} de favoritos`"
          title="Quitar de favoritos"
          @click="toggleFavorite(item)"
        >
          <Heart :size="16" :stroke-width="1.8" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { Heart } from "lucide-vue-next";
import { useCart } from "~/composables/useCart";
import { useFavorites } from "~/composables/useFavorites";
import { useImageUrl } from "~/composables/useImageUrl";
import { MENU_QUERY, defaultCartOptions, menuEntries, type MenuCategory, type MenuEntry } from "~/composables/useMenu";
import { useCustomerOrdering } from "~/composables/useSiteSettings";

// La carta publica solo trae lo que esta a la venta: un favorito agotado o retirado no sale aqui.
const { result } = useQuery<{ menu: MenuCategory[] }>(MENU_QUERY);
const { isFavorite, toggleFavorite } = useFavorites();
const { resolveImageUrl } = useImageUrl();
const { add } = useCart();
const canOrder = useCustomerOrdering();

const favorites = computed(() =>
  (result.value?.menu ?? []).flatMap((category) => menuEntries(category.items)).filter((entry) => isFavorite(entry))
);

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

const addedId = ref<string | null>(null);
let addedTimeout: ReturnType<typeof setTimeout> | null = null;
function addToCart(item: MenuEntry) {
  add({ id: item.id, name: item.name, priceCents: item.priceCents, imageUrl: resolveImageUrl(item.imageUrl) }, defaultCartOptions(item));
  addedId.value = item.id;
  if (addedTimeout) clearTimeout(addedTimeout);
  addedTimeout = setTimeout(() => (addedId.value = null), 1500);
}
onBeforeUnmount(() => {
  if (addedTimeout) clearTimeout(addedTimeout);
});
</script>

<style scoped>
.favorite-list { list-style: none; margin: 12px 0 0; padding: 0; }
.favorite-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--field-border);
}
.favorite-row:last-child { border-bottom: none; }
.favorite-thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.favorite-thumb--empty { background: var(--surface-alt); }
.favorite-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.favorite-name { font-family: var(--font-serif); font-size: 15px; color: var(--text); }
.favorite-price { font-size: 13px; color: var(--text-muted); }
.add { padding: 8px 12px; font-size: 12px; flex-shrink: 0; }
.unfav {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--danger);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.unfav svg { fill: currentColor; }
.unfav:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
