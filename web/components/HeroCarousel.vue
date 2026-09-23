<template>
  <section v-if="slides.length" class="carousel" aria-roledescription="carrusel" aria-label="Ofertas y novedades" @mouseenter="paused = true" @mouseleave="paused = false" @touchstart.passive="paused = true">
    <div ref="track" class="track" @scroll.passive="onScroll">
      <HeroSlideCard
        v-for="(slide, i) in slides"
        :key="slide.id"
        :slide="slide"
        class="track-slide"
        :aria-label="`${i + 1} de ${slides.length}`"
      />
    </div>
    <div v-if="slides.length > 1" class="dots" role="tablist">
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
import { HERO_SLIDES_QUERY, type HeroSlide } from "~/composables/useHeroSlides";

// Las gestiona el personal en el panel ("Portada"): solo llegan las activas y vigentes hoy.
const { result } = useQuery<{ heroSlides: HeroSlide[] }>(HERO_SLIDES_QUERY);
const slides = computed(() => result.value?.heroSlides ?? []);

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
      if (paused.value || slides.value.length < 2) return;
      goTo((current.value + 1) % slides.value.length);
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

/* Dentro del carrusel las esquinas las redondea .track (mas especifico que .slide de la tarjeta). */
.track > .track-slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
  border-radius: 0;
}

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
