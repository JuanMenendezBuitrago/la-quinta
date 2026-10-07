<template>
  <!-- Acceso rapido del personal en movil y tablet: lo que mas se usa durante el turno. El resto
       de secciones sigue en el menu (StaffNav). -->
  <nav class="quickbar" aria-label="Acceso rápido">
    <button
      v-for="action in actions"
      :key="action.id"
      type="button"
      class="quick"
      :class="{ current: action.current, primary: action.primary }"
      :aria-current="action.current ? 'page' : undefined"
      @click="action.go()"
    >
      <span class="quick-icon">
        <component :is="action.icon" :size="action.primary ? 24 : 20" :stroke-width="1.8" />
        <span v-if="action.badge" class="badge" :class="{ danger: action.danger }">{{ action.badge }}</span>
      </span>
      <span class="quick-label">{{ action.label }}</span>
    </button>
  </nav>
  <!-- Hueco al final de la pagina para que la barra fija no tape el pie ni la ultima tarjeta -->
  <div class="quickbar-spacer" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { ClipboardList, History, Package, SquarePen, Wallet } from "lucide-vue-next";
import { useStaffAuth } from "~/composables/useAuth";
import { goToSection, sectionsFor, useStaffBadges, useStaffSection, type StaffSectionId } from "~/composables/useStaffSections";

interface QuickAction {
  id: string;
  label: string;
  icon: Component;
  go: () => unknown;
  current?: boolean;
  primary?: boolean;
  badge?: number;
  danger?: boolean;
}

const { staff } = useStaffAuth();
const section = useStaffSection();
const badges = useStaffBadges();

// Cambiar de seccion solo cambia la query (?s=...): sin esto se quedaria el scroll de la anterior,
// p. ej. al fondo de la cola.
async function goToSectionTop(id: StaffSectionId) {
  await goToSection(id);
  window.scrollTo({ top: 0 });
}

// "Por cobrar" no es una seccion: es la ultima columna de la cola, que en movil queda al fondo.
async function goToAwaitingPayment() {
  await goToSection("cola");
  await nextTick();
  document.getElementById("cola-POR_COBRAR")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const actions = computed<QuickAction[]>(() => {
  const visible = new Set<StaffSectionId>(sectionsFor(staff.value?.role).map((s) => s.id));
  const sectionAction = (id: StaffSectionId, label: string, icon: Component, extra: Partial<QuickAction> = {}) =>
    visible.has(id) ? [{ id, label, icon, go: () => goToSectionTop(id), current: section.value === id, ...extra }] : [];
  return [
    ...sectionAction("cola", "Cola", ClipboardList, { badge: badges.value.cola }),
    ...(visible.has("cola")
      ? [{ id: "por-cobrar", label: "Por cobrar", icon: Wallet, go: goToAwaitingPayment, badge: badges.value.porCobrar }]
      : []),
    ...sectionAction("tomar", "Tomar", SquarePen, { primary: true }),
    ...sectionAction("historial", "Historial", History),
    ...sectionAction("inventario", "Inventario", Package, { badge: badges.value.inventario, danger: true }),
  ];
});
</script>

<style scoped>
.quickbar,
.quickbar-spacer { display: none; }

/* Movil y tablet (hasta 1024 px, p. ej. un iPad en horizontal); en escritorio basta el menu superior */
@media (max-width: 1024px) {
  .quickbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 80; /* por debajo del panel lateral del menu (90/100) */
    display: grid;
    /* En tablet las 5 acciones no se estiran a todo el ancho: quedan centradas */
    grid-template-columns: repeat(5, minmax(0, 120px));
    justify-content: center;
    align-items: end;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid color-mix(in srgb, var(--text) 15%, transparent);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
  }
  .quickbar-spacer { display: block; height: calc(72px + env(safe-area-inset-bottom)); }
}

.quick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-height: 52px;
  padding: 4px 2px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.quick.current { color: var(--accent-strong); font-weight: 700; }
.quick-icon { position: relative; display: inline-flex; }
.quick-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

/* Tomar pedido: la accion mas repetida, destacada en el centro */
.quick.primary .quick-icon {
  padding: 10px;
  margin-top: -18px;
  border-radius: 999px;
  background: var(--accent-strong);
  color: var(--bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.quick.primary.current .quick-icon { outline: 2px solid var(--accent-strong); outline-offset: 2px; }

.badge {
  position: absolute;
  top: -6px;
  right: -10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font-size: 10px;
  font-weight: 700;
}
.badge.danger { background: var(--danger); color: #fff; }
</style>
