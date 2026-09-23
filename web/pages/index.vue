<template>
  <main class="container page-menu">
    <header class="menu-hero">
      <HeroCarousel />
    </header>

    <p v-if="loading" class="muted">Cargando la carta…</p>
    <p v-else-if="error" class="muted">No se pudo cargar la carta. ¿Está la API en marcha?</p>

    <nav v-if="menu.length" ref="pillsNav" class="category-pills" aria-label="Categorías">
      <button
        v-for="category in menu"
        :key="category.id"
        type="button"
        class="pill"
        :class="{ active: activeCategoryId === category.id }"
        :data-cat-id="category.id"
        @click="selectCategory(category.id)"
      >
        {{ category.name }}
      </button>
    </nav>

    <section v-for="category in menu" :id="`cat-${category.id}`" :key="category.id" class="category">
      <h2 class="category-title">{{ category.name }}</h2>
      <div class="items">
        <article v-for="item in category.items" :key="item.id" class="item" :title="item.description || undefined">
          <img
            v-if="item.imageUrl"
            :src="resolveImageUrl(item.imageUrl)"
            :alt="item.name"
            class="item-image"
            role="button"
            tabindex="0"
            @click="openProduct(item)"
            @keydown.enter="openProduct(item)"
          />
          <div class="item-info">
            <h3 class="item-name">{{ item.name }}</h3>
            <span class="item-price price">{{ formatPrice(item.priceCents) }}</span>
          </div>
          <button
            class="add-btn"
            type="button"
            aria-label="Añadir al carrito"
            @click="add({ id: item.id, name: item.name, priceCents: item.priceCents, imageUrl: resolveImageUrl(item.imageUrl) })"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </article>
      </div>
    </section>

    <div v-if="cartCount" class="cart-bar">
      <span class="cart-summary">{{ cartCount }} {{ cartCount === 1 ? "producto" : "productos" }} · <span class="price">{{ formatPrice(totalCents) }}</span></span>
      <NuxtLink to="/carrito" class="button">Ver pedido</NuxtLink>
    </div>

    <ImageLightbox
      :url="lightboxUrl"
      :product="lightboxProduct"
      :has-prev="hasPrev"
      :has-next="hasNext"
      :direction="direction"
      @close="closeLightbox"
      @prev="goPrev"
      @next="goNext"
    />
  </main>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useCart } from "~/composables/useCart";
import { useLightbox } from "~/composables/useLightbox";
import { useImageUrl } from "~/composables/useImageUrl";
import ImageLightbox from "~/components/ImageLightbox.vue";

const MENU_QUERY = gql`
  query Menu {
    menu {
      id
      name
      items {
        id
        name
        description
        priceCents
        allergens
        imageUrl
      }
    }
  }
`;

const { result, loading, error } = useQuery(MENU_QUERY);
const menu = computed(() => result.value?.menu ?? []);
const { add, cartCount, totalCents } = useCart();

const activeCategoryId = ref<string | null>(null);
const pillsNav = ref<HTMLElement | null>(null);
watch(
  menu,
  (val) => {
    if (val.length && !activeCategoryId.value) activeCategoryId.value = val[0].id;
  },
  { immediate: true }
);

// Si la píldora activa queda fuera del área visible del navbar horizontal, lo desplaza
// para centrarla.
function centerActivePill() {
  const container = pillsNav.value;
  if (!container || !activeCategoryId.value) return;
  const btn = container.querySelector<HTMLElement>(`[data-cat-id="${activeCategoryId.value}"]`);
  if (!btn) return;
  const btnLeft = btn.offsetLeft;
  const btnRight = btnLeft + btn.offsetWidth;
  const viewLeft = container.scrollLeft;
  const viewRight = viewLeft + container.clientWidth;
  if (btnLeft >= viewLeft && btnRight <= viewRight) return;
  const target = btnLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
  container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
}

// Detecta qué categoría está visible bajo la barra sticky y marca su píldora como activa.
// (mismo offset que .category { scroll-margin-top })
const STICKY_OFFSET = 140;

let sectionEls: HTMLElement[] = [];
let suppressScrollSpy = false;
let suppressTimeout: ReturnType<typeof setTimeout> | null = null;
let scrollTicking = false;

function updateActiveFromScroll() {
  if (suppressScrollSpy || !sectionEls.length) return;
  let current = sectionEls[0];
  for (const el of sectionEls) {
    if (el.getBoundingClientRect().top - STICKY_OFFSET <= 0) {
      current = el;
    } else {
      break;
    }
  }
  activeCategoryId.value = current.id.replace("cat-", "");
}

function onScroll() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    updateActiveFromScroll();
    scrollTicking = false;
  });
}

if (import.meta.client) {
  watch(
    menu,
    async (val) => {
      if (!val.length) return;
      await nextTick();
      sectionEls = val
        .map((category) => document.getElementById(`cat-${category.id}`))
        .filter((el): el is HTMLElement => !!el);
      // Fuerza un cambio real de valor: si el SSR y el cliente calcularon la misma
      // píldora activa, Vue no vuelve a pintar la clase tras la hidratación (mismatch
      // "check-only"), así que sin este reset la primera píldora podía quedar sin marcar.
      activeCategoryId.value = null;
      await nextTick();
      updateActiveFromScroll();
    },
    { immediate: true }
  );

  watch(activeCategoryId, async () => {
    await nextTick();
    centerActivePill();
  });

  onMounted(() => window.addEventListener("scroll", onScroll, { passive: true }));
  onBeforeUnmount(() => {
    window.removeEventListener("scroll", onScroll);
    if (suppressTimeout) clearTimeout(suppressTimeout);
  });
}

function selectCategory(id: string) {
  activeCategoryId.value = id;
  suppressScrollSpy = true;
  if (suppressTimeout) clearTimeout(suppressTimeout);
  document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  suppressTimeout = setTimeout(() => {
    suppressScrollSpy = false;
  }, 700);
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

const { lightboxUrl, lightboxProduct, hasPrev, hasNext, direction, openGallery, closeLightbox, goPrev, goNext } =
  useLightbox();
const { resolveImageUrl } = useImageUrl();

// Lista plana de todos los productos con foto, en el mismo orden en que aparecen en la
// carta (categoria a categoria). Es lo que permite el swipe / las flechas de la vista
// ampliada: navegar de un producto al siguiente sin volver al grid, cruzando categorias.
const navigableItems = computed(() =>
  menu.value.flatMap((category: any) =>
    category.items
      .filter((item: any) => item.imageUrl)
      .map((item: any) => ({ url: resolveImageUrl(item.imageUrl), product: item }))
  )
);

function openProduct(item: any) {
  const resolvedUrl = resolveImageUrl(item.imageUrl);
  const startIndex = navigableItems.value.findIndex((entry) => entry.url === resolvedUrl && entry.product.id === item.id);
  openGallery(navigableItems.value, Math.max(startIndex, 0));
}
</script>

<style scoped>
.page-menu { padding-bottom: 24px; }

.menu-hero { margin-bottom: 4px; }

.category-pills {
  position: sticky;
  top: 62px;
  z-index: 20;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -20px;
  padding: 18px 20px 10px;
  background: var(--bg);
  scrollbar-width: none;
}
.category-pills::-webkit-scrollbar { display: none; }
.pill {
  flex-shrink: 0;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
  font-weight: 600;
}

.category { margin-top: 36px; scroll-margin-top: 140px; }
.category-title { margin-bottom: 14px; text-transform: uppercase; }

/* Muro estilo Instagram: 3 columnas de tiles cuadrados con poco espacio entre ellos */
.items {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
}
.item {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: var(--surface-alt);
}
.item-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}
.item-info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 22px 8px 7px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
  color: #fff;
  pointer-events: none;
}
/* Sin imagen: el nombre y el precio ocupan el tile */
.item:not(:has(.item-image)) .item-info {
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 10px;
  background: none;
  color: var(--text);
}
.item-name {
  margin: 0;
  font-size: 12px;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--bg);
  font-weight: 800;
  overflow: hidden;
}
.item-price { font-size: 12px; font-weight: 600; white-space: nowrap; }
.item:not(:has(.item-image)) .item-price { color: var(--accent); }

.add-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

@media (min-width: 640px) {
  .items { gap: 6px; }
  .item-name, .item-price { font-size: 14px; }
  .item-info { padding: 32px 12px 10px; }
  .add-btn { width: 34px; height: 34px; top: 8px; right: 8px; }
}

.cart-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--surface-alt);
  border-top: 1px solid var(--border-strong);
  padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
}
.cart-summary { font-size: 14px; color: var(--text); }
.cart-bar .button { text-decoration: none; }
</style>
