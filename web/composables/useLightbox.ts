export interface LightboxProduct {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  allergens?: string[];
  imageUrl?: string | null;
}

interface LightboxEntry {
  url: string;
  product: LightboxProduct | null;
}

export function useLightbox() {
  // Siempre una "galeria": el caso simple (una sola imagen, p. ej. una miniatura de pedido
  // en "Mi cuenta") es una galeria de un elemento, sin flechas ni gesto de swipe.
  const items = ref<LightboxEntry[]>([]);
  const index = ref(0);

  const lightboxUrl = computed(() => items.value[index.value]?.url ?? null);
  const lightboxProduct = computed(() => items.value[index.value]?.product ?? null);
  const hasPrev = computed(() => items.value.length > 1 && index.value > 0);
  const hasNext = computed(() => items.value.length > 1 && index.value < items.value.length - 1);
  // Sentido del ultimo paso, para que la vista ampliada anime la entrada/salida en la
  // direccion del swipe (1 = avanzando, -1 = retrocediendo). Se fija aqui, no en el
  // componente, porque tambien hay que cubrir la navegacion por teclado (mas abajo).
  const direction = ref<1 | -1>(1);

  /** Abre una sola imagen (sin navegacion entre productos). */
  function openLightbox(url?: string | null, product?: LightboxProduct | null) {
    if (!url) return;
    items.value = [{ url, product: product ?? null }];
    index.value = 0;
  }

  /** Abre una imagen dentro de una lista navegable (swipe / flechas entre productos). */
  function openGallery(entries: LightboxEntry[], startIndex: number) {
    if (!entries.length) return;
    items.value = entries;
    index.value = Math.min(Math.max(startIndex, 0), entries.length - 1);
  }

  function closeLightbox() {
    items.value = [];
    index.value = 0;
  }

  function goPrev() {
    if (!hasPrev.value) return;
    direction.value = -1;
    index.value -= 1;
  }
  function goNext() {
    if (!hasNext.value) return;
    direction.value = 1;
    index.value += 1;
  }

  function onKeydown(event: KeyboardEvent) {
    if (!lightboxUrl.value) return;
    if (event.key === "Escape") closeLightbox();
    else if (event.key === "ArrowLeft") goPrev();
    else if (event.key === "ArrowRight") goNext();
  }

  onMounted(() => window.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

  return {
    lightboxUrl,
    lightboxProduct,
    hasPrev,
    hasNext,
    direction,
    openLightbox,
    openGallery,
    closeLightbox,
    goPrev,
    goNext,
  };
}
