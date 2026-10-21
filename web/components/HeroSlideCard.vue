<template>
  <!-- Con foto: de fondo, oscurecida por abajo para que el texto se lea; sin ella, el color del tono -->
  <article class="slide" :class="[`tone-${slide.tone}`, { 'has-image': backgroundUrl }]" :style="backgroundStyle">
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
import { useImageUrl } from "~/composables/useImageUrl";

// Una sola forma de pintar una diapositiva: la usan la portada y la vista previa del panel.
const props = defineProps<{
  slide: Pick<HeroSlide, "tag" | "title" | "text" | "tone" | "linkUrl" | "linkLabel"> & { imageUrl?: string | null };
}>();

const { resolveImageUrl } = useImageUrl();
const backgroundUrl = computed(() => (props.slide.imageUrl ? resolveImageUrl(props.slide.imageUrl) : null));
const backgroundStyle = computed(() =>
  backgroundUrl.value
    ? {
        backgroundImage: `linear-gradient(to top, rgba(20, 14, 8, 0.78) 0%, rgba(20, 14, 8, 0.35) 55%, rgba(20, 14, 8, 0.1) 100%), url("${backgroundUrl.value}")`,
      }
    : undefined
);
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
.tone-teal { background: var(--accent-soft); color: var(--on-accent-soft); }
.tone-brown { background: var(--color4); color: var(--bg); }
.tone-olive { background: var(--color5); color: var(--bg); }
/* Con foto el texto va siempre claro (sobre el degradado oscuro), sea cual sea el tono o el tema */
.slide.has-image {
  background-color: #2e241b;
  background-size: cover;
  background-position: center;
  color: #fffdf5;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

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
