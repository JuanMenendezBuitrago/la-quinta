<template>
  <!-- Pantallas anchas apaisadas: listado a la izquierda; media, reparto y filtros a la derecha -->
  <section class="reviews wide-layout">
    <aside class="wide-aside wide-aside--sticky">
    <div class="filters" role="group" aria-label="Tipo de opinión">
      <button
        v-for="k in KINDS"
        :key="k.id"
        type="button"
        class="chip"
        :class="{ active: kind === k.id }"
        :aria-pressed="kind === k.id"
        @click="kind = k.id"
      >
        {{ k.label }}
      </button>
    </div>

    <!-- Media y reparto de estrellas (cada barra filtra por esa puntuacion) -->
    <div v-if="stats" class="card stats">
      <div class="average">
        <span class="average-value">{{ stats.count ? stats.average.toFixed(1).replace(".", ",") : "–" }}</span>
        <StarRating :model-value="Math.round(stats.average)" display :size="18" />
        <span class="muted">{{ stats.count }} {{ stats.count === 1 ? "opinión" : "opiniones" }}</span>
      </div>
      <ul class="distribution">
        <li v-for="stars in [5, 4, 3, 2, 1]" :key="stars">
          <button
            type="button"
            class="bar-row"
            :class="{ active: rating === stars }"
            :aria-pressed="rating === stars"
            :aria-label="`${stars} estrellas: ${stats.distribution[stars - 1]}. Filtrar`"
            @click="rating = rating === stars ? null : stars"
          >
            <span class="bar-label">{{ stars }}★</span>
            <span class="bar"><span class="bar-fill" :style="{ width: barWidth(stars) }" /></span>
            <span class="bar-count">{{ stats.distribution[stars - 1] }}</span>
          </button>
        </li>
      </ul>
    </div>

    </aside>

    <div class="wide-main">
    <p v-if="loadError" class="muted error" role="alert">{{ loadError }}</p>
    <EmptyState
      v-else-if="!loading && !items.length"
      :icon="MessageSquare"
      :title="rating ? `No hay opiniones de ${rating} ${rating === 1 ? 'estrella' : 'estrellas'}` : 'Todavía no hay opiniones'"
    />

    <article v-for="r in items" :key="r.id" class="card review">
      <header class="review-head">
        <span class="who">
          <UserAvatar :avatar="r.customerAvatar" :name="r.customerName" :size="28" />
          <strong>{{ r.customerName }}</strong>
        </span>
        <StarRating :model-value="r.rating" display :size="16" />
      </header>
      <p v-if="r.comment" class="comment">{{ r.comment }}</p>
      <p class="muted meta">
        {{ r.orderCode ? `Pedido ${r.orderCode}` : "Sobre el local" }} · {{ formatDateTime(r.updatedAt) }}
        <template v-if="r.updatedAt !== r.createdAt"> (editada)</template>
      </p>
    </article>

    <button v-if="items.length < total" class="button secondary" type="button" :disabled="loading" @click="loadMore">
      {{ loading ? "Cargando…" : "Cargar más" }}
    </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { MessageSquare } from "lucide-vue-next";
import EmptyState from "~/components/EmptyState.vue";
import { gql } from "graphql-tag";
import StarRating from "~/components/StarRating.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import { useStoreTime } from "~/composables/useStoreTime";

type Kind = "ALL" | "ORDER" | "GENERAL";
interface StaffReview {
  id: string;
  orderCode: string | null;
  rating: number;
  comment: string | null;
  customerName: string;
  customerAvatar: string | null;
  createdAt: string;
  updatedAt: string;
}

const KINDS: { id: Kind; label: string }[] = [
  { id: "ALL", label: "Todas" },
  { id: "ORDER", label: "Sobre pedidos" },
  { id: "GENERAL", label: "Sobre el local" },
];
const PAGE_SIZE = 25;

const REVIEWS_QUERY = gql`
  query StaffReviews($kind: ReviewKind, $rating: Int, $limit: Int, $offset: Int) {
    reviewStats(kind: $kind) {
      count
      average
      distribution
    }
    reviews(kind: $kind, rating: $rating, limit: $limit, offset: $offset) {
      total
      items {
        id
        orderCode
        rating
        comment
        customerName
        customerAvatar
        createdAt
        updatedAt
      }
    }
  }
`;

const { formatDateTime } = useStoreTime();
const kind = ref<Kind>("ALL");
const rating = ref<number | null>(null);
const offset = ref(0);

const { result, loading, error, fetchMore } = useQuery(
  REVIEWS_QUERY,
  () => ({ kind: kind.value, rating: rating.value, limit: PAGE_SIZE, offset: 0 }),
  { fetchPolicy: "network-only" }
);
// Al cambiar de filtro se vuelve a la primera pagina.
watch([kind, rating], () => (offset.value = 0));

const stats = computed(() => result.value?.reviewStats ?? null);
const total = computed(() => result.value?.reviews.total ?? 0);
const items = computed<StaffReview[]>(() => result.value?.reviews.items ?? []);
const loadError = computed(() => (error.value ? "No se pudieron cargar las opiniones." : ""));

function barWidth(stars: number) {
  const max = Math.max(...(stats.value?.distribution ?? [0]), 1);
  return `${((stats.value?.distribution[stars - 1] ?? 0) / max) * 100}%`;
}

function loadMore() {
  offset.value += PAGE_SIZE;
  fetchMore({
    variables: { offset: offset.value },
    updateQuery: (prev: any, { fetchMoreResult }: any) =>
      fetchMoreResult
        ? { ...prev, reviews: { ...fetchMoreResult.reviews, items: [...prev.reviews.items, ...fetchMoreResult.reviews.items] } }
        : prev,
  });
}
</script>

<style scoped>
.reviews .wide-main, .reviews .wide-aside { gap: 12px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--field-border);
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip.active { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }

.stats { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; }
.average { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.average-value { font-family: var(--font-futura-text); font-size: 36px; font-weight: 900; line-height: 1; }
.distribution { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 4px; }
.bar-row {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.bar-row.active { background: var(--surface-alt); font-weight: 700; }
.bar-row:focus-visible { outline: 2px solid var(--accent); }
.bar { height: 8px; border-radius: 999px; background: var(--surface-alt); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--color5); border-radius: 999px; }
.bar-count { text-align: right; font-variant-numeric: tabular-nums; }

.review-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.who { display: flex; align-items: center; gap: 8px; }
.comment { margin: 8px 0 0; white-space: pre-line; }
.meta { margin: 6px 0 0; font-size: 13px; }
.error { color: var(--danger); }
</style>
