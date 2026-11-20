<template>
  <!-- Version nueva desplegada: el service worker ya tiene los archivos nuevos y espera a que se
       recargue. Aviso fijo arriba, con boton; si nadie lo pulsa, se recarga sola en cuanto la
       pantalla lleva un rato sin usarse y no hay nada a medias que se pudiera perder. -->
  <Transition name="update-banner">
    <div v-if="needRefresh" class="update-banner" role="status">
      <RefreshCw :size="18" :stroke-width="1.8" aria-hidden="true" />
      <span class="update-text">Hay una versión nueva</span>
      <button type="button" class="update-button" :disabled="updating" @click="update">
        {{ updating ? "Actualizando…" : "Actualizar" }}
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";
import type { CartLine } from "~/composables/useCart";
import { useEditingOrder } from "~/composables/useStaffOrders";

// Sin tocar la pantalla este tiempo, se considera que nadie la esta usando.
const IDLE_MS = 2 * 60 * 1000;
// Cada cuanto se mira si ya se puede recargar sola.
const CHECK_MS = 15 * 1000;
// Secciones del panel sin formularios: recargar ahi no pierde nada (el ticket se mira aparte).
const SAFE_STAFF_SECTIONS = new Set([undefined, "cola", "tomar", "historial"]);
// Paginas del cliente sin formularios (el carrito, si esta vacio).
const SAFE_PUBLIC_PATHS = new Set(["/", "/carrito", "/privacidad"]);

const { $pwa } = useNuxtApp();
const route = useRoute();
const needRefresh = computed(() => !!$pwa?.needRefresh);
const updating = ref(false);

// Pedidos que solo viven en memoria: una recarga los borraria.
const publicCart = useState<CartLine[]>("cart-lines", () => []);
const staffTicket = useState<CartLine[]>("staff-ticket-lines", () => []);
const staffEdit = useState<CartLine[]>("staff-edit-lines", () => []);
const editingOrder = useEditingOrder();

function update() {
  if (updating.value) return;
  updating.value = true;
  // Activa el service worker nuevo y recarga en cuanto toma el control.
  $pwa?.updateServiceWorker(true);
  // Si la pagina no estaba controlada por el service worker (p. ej. la primera visita), ese
  // "toma el control" no llega nunca: se recarga igualmente al poco.
  setTimeout(() => window.location.reload(), 3000);
}

/** Nada a medias: sin pedidos montados, dialogos abiertos ni un campo en uso. */
function safeToReload() {
  if (publicCart.value.length || staffTicket.value.length || staffEdit.value.length) return false;
  if (editingOrder.value) return false;
  if (document.querySelector("dialog[open], [aria-modal='true']")) return false;
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.matches("input, textarea, select") || active.isContentEditable)) return false;
  if (route.path === "/staff") {
    const section = typeof route.query.s === "string" ? route.query.s : undefined;
    return SAFE_STAFF_SECTIONS.has(section);
  }
  return SAFE_PUBLIC_PATHS.has(route.path);
}

let lastActivity = Date.now();
function markActivity() {
  lastActivity = Date.now();
}
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

// Al volver a la pestaña (o encender la pantalla de la tablet), se pregunta ya si hay version
// nueva, sin esperar a la comprobacion periodica.
function onVisibility() {
  if (document.visibilityState === "visible") {
    $pwa?.getSWRegistration()?.update().catch(() => {});
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, markActivity, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  timer = setInterval(() => {
    if (needRefresh.value && Date.now() - lastActivity >= IDLE_MS && safeToReload()) update();
  }, CHECK_MS);
});
onBeforeUnmount(() => {
  for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActivity, { capture: true });
  document.removeEventListener("visibilitychange", onVisibility);
  clearInterval(timer);
});
</script>

<style scoped>
.update-banner {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  /* Por encima de la cabecera (85) y de su panel lateral (100) */
  z-index: 110;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 32px);
  padding: 6px 6px 6px 16px;
  border-radius: 100px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  border: 1px solid var(--border-strong);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.update-text { overflow: hidden; text-overflow: ellipsis; }
.update-button {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 100px;
  background: var(--accent);
  color: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.update-button:disabled { opacity: 0.7; cursor: default; }
.update-banner-enter-active, .update-banner-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.update-banner-enter-from, .update-banner-leave-to { opacity: 0; transform: translate(-50%, -8px); }
@media (prefers-reduced-motion: reduce) {
  .update-banner-enter-active, .update-banner-leave-active { transition: none; }
}
</style>
