<template>
  <section class="carousel" aria-roledescription="carrusel" aria-label="Ofertas y novedades" @mouseenter="paused = true" @mouseleave="paused = false" @touchstart.passive="paused = true">
    <div ref="track" class="track" @scroll.passive="onScroll">
      <article v-for="(slide, i) in slides" :key="slide.id" class="slide" :class="`tone-${slide.tone}`" :aria-label="`${i + 1} de ${slides.length}`">
        <span class="tag">{{ slide.tag }}</span>
        <h2 class="slide-title">{{ slide.title }}</h2>
        <p class="slide-text">{{ slide.text }}</p>
      </article>
    </div>
    <div class="dots" role="tablist">
      <button
        v-for="(slide, i) in slides"
        :key="slide.id"
        type="button"
        class="dot"
        :class="{ active: i === current }"
        :aria-label="`Ir a ${slide.title}`"
        :aria-selected="i === current"
        role="tab"
        @click="goTo(i)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
// Contenido de ejemplo: más adelante vendrá de la API (ofertas, novedades, noticias…).
const slides = [
  { id: 1, tag: "Oferta", title: "2x1 en cafés de filtro", text: "Todos los martes de 8:00 a 11:00.", tone: "teal" },
  { id: 2, tag: "Novedad", title: "Nuevo café de origen Huila", text: "Notas a panela, cítricos y chocolate.", tone: "brown" },
  { id: 3, tag: "Noticia", title: "Taller de cata este sábado", text: "Aprende a distinguir aromas y sabores. Plazas limitadas.", tone: "olive" },
  { id: 4, tag: "Fidelización", title: "Suma sellos con cada pedido", text: "Al décimo café, el siguiente es cortesía de la casa.", tone: "teal" },
];

const track = ref<HTMLElement | null>(null);
const current = ref(0);
const paused = ref(false);

function onScroll() {
  const el = track.value;
  if (!el) return;
  current.value = Math.round(el.scrollLeft / el.clientWidth);
}

function goTo(i: number) {
  const el = track.value;
  if (!el) return;
  el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
}

if (import.meta.client) {
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = setInterval(() => {
      if (paused.value) return;
      goTo((current.value + 1) % slides.length);
    }, 5000);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });
}
</script>

<style scoped>
.carousel { margin-top: 0px; }

.track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  border-radius: 14px;
}
.track::-webkit-scrollbar { display: none; }

.slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
  min-height: 150px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
}
.tone-teal { background: var(--accent); color: #3d5f5e; }
.tone-brown { background: var(--color4); color: var(--bg); }
.tone-olive { background: var(--color5); color: var(--bg); }

.tag {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.slide-title { color: inherit; font-size: 24px; line-height: 1.1; }
.slide-text { margin: 0; font-size: 13.5px; opacity: 0.9; }

.dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
.dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.3;
  cursor: pointer;
  transition: opacity 0.15s ease, width 0.15s ease;
}
.dot.active { opacity: 1; width: 18px; border-radius: 999px; }
</style>
