<template>
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div v-if="url" class="lightbox" @click="$emit('close')">
        <button class="lightbox-close" type="button" aria-label="Cerrar" @click.stop="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        <button
          v-if="hasPrev"
          class="lightbox-nav lightbox-nav-prev"
          type="button"
          aria-label="Producto anterior"
          @click.stop="$emit('prev')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <button
          v-if="hasNext"
          class="lightbox-nav lightbox-nav-next"
          type="button"
          aria-label="Producto siguiente"
          @click.stop="$emit('next')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>

        <div class="lightbox-card" @click.stop @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <Transition :name="direction === -1 ? 'slide-prev' : 'slide-next'" mode="out-in">
            <div :key="url" class="lightbox-page">
              <img :src="url" alt="" class="lightbox-image" />

              <div v-if="product" class="lightbox-info">
                <div class="lightbox-heading">
                  <h3 class="lightbox-name">{{ product.name }}</h3>
                  <span class="lightbox-price price">{{ formatPrice(unitPriceCents) }}</span>
                </div>
                <p v-if="product.description" class="lightbox-desc">{{ product.description }}</p>
                <p v-if="product.allergens?.length" class="lightbox-allergens">
                  Alérgenos: {{ product.allergens.join(", ") }}
                </p>
                <!-- Personalizaciones (p. ej. Leche): viene marcada la de la receta -->
                <div v-for="m in canOrder ? singleChoice : []" :key="m.group.id" class="lightbox-modifier">
                  <span class="lightbox-qty-label">{{ m.group.name }}</span>
                  <div class="modifier-chips" role="radiogroup" :aria-label="m.group.name">
                    <button
                      v-if="m.group.minSelect === 0"
                      type="button"
                      role="radio"
                      :aria-checked="!selected[m.group.id]"
                      :class="{ active: !selected[m.group.id] }"
                      @click="selected[m.group.id] = ''"
                    >
                      Ninguna
                    </button>
                    <button
                      v-for="o in m.group.options"
                      :key="o.id"
                      type="button"
                      role="radio"
                      :aria-checked="selected[m.group.id] === o.id"
                      :class="{ active: selected[m.group.id] === o.id }"
                      @click="selected[m.group.id] = o.id"
                    >
                      {{ o.name }}<span v-if="o.priceDeltaCents" class="chip-delta"> +{{ formatPrice(o.priceDeltaCents) }}</span>
                    </button>
                  </div>
                </div>
                <div v-if="canOrder" class="lightbox-qty-row">
                  <span class="lightbox-qty-label">Cantidad en el pedido</span>
                  <div class="qty">
                    <button class="qty-btn" type="button" aria-label="Quitar una unidad" :disabled="quantity === 0" @click="decrease">−</button>
                    <span class="qty-value">{{ quantity }}</span>
                    <button class="qty-btn" type="button" aria-label="Añadir una unidad" :disabled="missing.length > 0" @click="increase">+</button>
                  </div>
                </div>
                <button v-if="canOrder" class="button lightbox-add" type="button" :disabled="missing.length > 0" @click="onAddClick">
                  {{ justAdded ? "Añadido ✓" : missing.length ? `Elige ${missing[0].group.name.toLowerCase()}` : "Añadir al pedido" }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { cartLineKey, useCart } from "~/composables/useCart";
import { cartOption, defaultCartOptions, missingModifiers } from "~/composables/useMenu";
import { useCustomerOrdering } from "~/composables/useSiteSettings";
import type { LightboxProduct } from "~/composables/useLightbox";

const props = withDefaults(
  defineProps<{
    url: string | null;
    product?: LightboxProduct | null;
    hasPrev?: boolean;
    hasNext?: boolean;
    direction?: 1 | -1;
  }>(),
  { direction: 1 }
);
const emit = defineEmits<{ (e: "close"): void; (e: "prev"): void; (e: "next"): void }>();

// Gesto de swipe horizontal para pasar de producto sin volver a la lista. Se mide en
// touchstart/touchend (no se sigue el dedo en vivo) para no interferir con el scroll
// vertical de la tarjeta de info en pantallas pequeñas.
const SWIPE_THRESHOLD = 45;
let touchStartX = 0;
let touchStartY = 0;

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function onTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;
  if (deltaX < 0) emit("next");
  else emit("prev");
}

const { lines, add, setQuantity } = useCart();
const canOrder = useCustomerOrdering();

// Opcion elegida en cada grupo de una sola opcion; al pasar a otro producto vuelve a la de su receta.
const singleChoice = computed(() => (props.product?.modifiers ?? []).filter((m) => m.group.maxSelect === 1));
const selected = ref<Record<string, string>>({});
watch(
  () => props.product?.id,
  () => {
    selected.value = Object.fromEntries(defaultCartOptions(props.product ?? {}).map((o) => [o.groupId, o.id]));
  },
  { immediate: true }
);
const chosenOptions = computed(() =>
  singleChoice.value.flatMap((m) => {
    const option = selected.value[m.group.id] ? cartOption(m, selected.value[m.group.id]) : null;
    return option ? [option] : [];
  })
);
const missing = computed(() => missingModifiers(props.product?.modifiers, chosenOptions.value));
const unitPriceCents = computed(
  () => (props.product?.priceCents ?? 0) + chosenOptions.value.reduce((sum, o) => sum + o.priceDeltaCents, 0)
);

// Cantidad en el pedido de este producto CON las opciones elegidas (0 si aun no se ha añadido).
// Al ser el mismo estado global que usa el carrito, tocar aqui el "+"/"-" se refleja
// tambien en /carrito sin recargar nada.
const lineKey = computed(() => (props.product ? cartLineKey(props.product.id, chosenOptions.value) : ""));
const quantity = computed(() => lines.value.find((l) => l.key === lineKey.value)?.quantity ?? 0);

function increase() {
  if (!props.product || missing.value.length) return;
  add(
    {
      id: props.product.id,
      name: props.product.name,
      priceCents: props.product.priceCents,
      imageUrl: props.url,
    },
    chosenOptions.value
  );
}

function decrease() {
  if (!props.product) return;
  setQuantity(lineKey.value, quantity.value - 1);
}

// Boton explicito debajo de la cantidad: para quien no relacione el "+" del stepper con
// "añadir al pedido". Hace lo mismo que ese "+", con una confirmacion breve en el propio
// boton en vez de cerrar la vista ampliada.
const justAdded = ref(false);
let justAddedTimeout: ReturnType<typeof setTimeout> | null = null;

function onAddClick() {
  increase();
  justAdded.value = true;
  if (justAddedTimeout) clearTimeout(justAddedTimeout);
  justAddedTimeout = setTimeout(() => (justAdded.value = false), 1200);
}

onBeforeUnmount(() => {
  if (justAddedTimeout) clearTimeout(justAddedTimeout);
});

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 19, 15, 0.92);
  padding: 32px 20px;
  cursor: zoom-out;
  overflow-y: auto;
}
.lightbox-card {
  max-width: min(90vw, 480px);
  max-height: 100%;
  cursor: default;
  /* Contiene el desplazamiento de .lightbox-page durante la animacion de swipe. */
  overflow: hidden;
  border-radius: 8px;
}
.lightbox-page { display: flex; flex-direction: column; }
.lightbox-image {
  width: 100%;
  max-height: 60vh;
  border-radius: 8px 8px 0 0;
  object-fit: contain;
  background: #000;
}
.lightbox-info {
  background: var(--surface);
  border-radius: 0 0 8px 8px;
  padding: 16px 18px calc(18px + env(safe-area-inset-bottom, 0px));
}
/* Sin foto: la tarjeta de info es todo el contenido, sin franja negra encima */
.lightbox-image + .lightbox-info { border-top: 1px solid var(--border); }

.lightbox-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.lightbox-name { margin: 0; }
.lightbox-price { color: var(--accent); font-size: 15px; font-weight: 600; white-space: nowrap; }
.lightbox-desc { color: var(--text-muted); font-size: 13.5px; line-height: 1.5; margin: 8px 0 0; }
.lightbox-allergens { color: var(--text-muted); font-size: 11.5px; margin: 6px 0 0; opacity: 0.8; }

.lightbox-qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.lightbox-qty-label { font-size: 13.5px; color: var(--text); font-weight: 600; }

.qty { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.qty-btn {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.qty-btn:hover { border-color: var(--accent); color: var(--accent); }
.qty-btn:disabled { opacity: 0.35; cursor: default; }
.qty-btn:disabled:hover { border-color: var(--border-strong); color: var(--text); }
.qty-value { min-width: 16px; text-align: center; font-variant-numeric: tabular-nums; }

.lightbox-add { width: 100%; margin-top: 12px; }

.lightbox-modifier { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.modifier-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.modifier-chips button {
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.modifier-chips button.active { border-color: var(--accent); background: var(--accent); color: var(--bg); font-weight: 600; }
.chip-delta { font-size: 12px; opacity: 0.85; }

.lightbox-close {
  position: fixed;
  top: calc(20px + env(safe-area-inset-top, 0px));
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lightbox-close:hover { border-color: var(--accent); }

/* Solo escritorio (raton): en tactil ya se navega con el swipe, y las flechas fijas
   estorbarian sobre la imagen sin aportar nada. */
.lightbox-nav { display: none; }
@media (hover: hover) and (pointer: fine) {
  .lightbox-nav {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
  }
  .lightbox-nav:hover { border-color: var(--accent); }
  .lightbox-nav-prev { left: 24px; }
  .lightbox-nav-next { right: 24px; }
}

.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.15s ease; }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0; }

/* Desplazamiento con la direccion del swipe (o de la flecha/tecla pulsada): la pagina
   saliente y la entrante se mueven en el mismo sentido, como si una empujara a la otra. */
.slide-next-enter-active, .slide-next-leave-active,
.slide-prev-enter-active, .slide-prev-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}
.slide-next-enter-from { transform: translateX(90px); opacity: 0; }
.slide-next-leave-to { transform: translateX(-90px); opacity: 0; }
.slide-prev-enter-from { transform: translateX(-90px); opacity: 0; }
.slide-prev-leave-to { transform: translateX(90px); opacity: 0; }
</style>
