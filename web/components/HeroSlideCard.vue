<template>
  <article class="slide" :class="`tone-${slide.tone}`">
    <span class="tag">{{ slide.tag }}</span>
    <h2 class="slide-title">{{ slide.title }}</h2>
    <p v-if="slide.text" class="slide-text">{{ slide.text }}</p>
    <template v-if="slide.linkUrl && slide.linkLabel">
      <!-- Rutas propias sin recargar la pagina (el carrito vive en memoria); externas en pestaña nueva. -->
      <NuxtLink v-if="slide.linkUrl.startsWith('/')" :to="slide.linkUrl" class="slide-link">{{ slide.linkLabel }} →</NuxtLink>
      <a v-else :href="slide.linkUrl" target="_blank" rel="noopener noreferrer" class="slide-link">{{ slide.linkLabel }} →</a>
    </template>
  </article>
</template>

<script setup lang="ts">
import type { HeroSlide } from "~/composables/useHeroSlides";

// Una sola forma de pintar una diapositiva: la usan la portada y la vista previa del panel.
defineProps<{ slide: Pick<HeroSlide, "tag" | "title" | "text" | "tone" | "linkUrl" | "linkLabel"> }>();
</script>

<style scoped>
.slide {
  min-height: 150px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  border-radius: 14px;
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
.slide-title { color: inherit; font-size: 24px; line-height: 1.1; margin: 0; overflow-wrap: anywhere; }
.slide-text { margin: 0; font-size: 13.5px; opacity: 0.9; }
.slide-link {
  align-self: flex-start;
  margin-top: 4px;
  color: inherit;
  font-size: 13px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
