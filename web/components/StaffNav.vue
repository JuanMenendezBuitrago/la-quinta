<template>
  <nav ref="navEl" class="staff-nav" aria-label="Panel de personal">
    <!-- Movil: icono hamburguesa que abre el menu como panel lateral desde la derecha -->
    <button
      type="button"
      class="menu-toggle"
      :aria-expanded="open === 'mobile'"
      aria-controls="staff-menu"
      :aria-label="`Abrir menú (sección actual: ${currentLabel})`"
      @click="toggle('mobile')"
    >
      <span class="burger" aria-hidden="true"><span /><span /><span /></span>
      <span v-if="totalBadge" class="badge toggle-badge" :class="{ danger: badges.inventario }">{{ totalBadge }}</span>
    </button>

    <div class="backdrop" :class="{ visible: open === 'mobile' }" aria-hidden="true" @click="open = null" />

    <div id="staff-menu" class="menu" :class="{ 'mobile-open': open === 'mobile' }">
      <div class="panel-head">
        <span>Panel de personal</span>
        <button ref="closeBtn" type="button" class="close" aria-label="Cerrar menú" @click="open = null">×</button>
      </div>
      <div v-for="group in groups" :key="group.id" class="group" :class="{ active: group.id === currentGroup }">
        <!-- Grupo con una sola entrada: enlace directo, sin desplegable -->
        <template v-if="group.entries.length === 1">
          <span class="group-title">{{ group.label }}</span>
          <component
            :is="group.entries[0].external ? 'a' : 'button'"
            v-bind="entryAttrs(group.entries[0])"
            class="group-btn single"
            :class="{ current: group.entries[0].id === section }"
            @click="select(group.entries[0])"
          >
            <component :is="ENTRY_ICONS[group.entries[0].id]" class="entry-icon" :size="16" :stroke-width="1.8" />
            {{ group.entries[0].label }}
            <span v-if="group.entries[0].badge" class="badge" :class="{ danger: group.entries[0].danger }">{{ group.entries[0].badge }}</span>
          </component>
        </template>

        <template v-else>
          <span class="group-title">{{ group.label }}</span>
          <button type="button" class="group-btn" :aria-expanded="open === group.id" @click="toggle(group.id)">
            {{ group.label }}
            <span v-if="group.badge" class="badge" :class="{ danger: group.danger }">{{ group.badge }}</span>
            <ChevronDown class="caret" :size="14" :stroke-width="2" />
          </button>
          <ul class="dropdown" :class="{ open: open === group.id }">
            <li v-for="entry in group.entries" :key="entry.id">
              <component
                :is="entry.external ? 'a' : 'button'"
                v-bind="entryAttrs(entry)"
                class="entry"
                :class="{ current: entry.id === section }"
                :aria-current="entry.id === section ? 'page' : undefined"
                @click="select(entry)"
              >
                <component :is="ENTRY_ICONS[entry.id]" class="entry-icon" :size="16" :stroke-width="1.8" />
                <span class="entry-label">{{ entry.label }}</span>
                <span v-if="entry.badge" class="badge" :class="{ danger: entry.danger }">{{ entry.badge }}</span>
              </component>
            </li>
          </ul>
        </template>
      </div>

      <!-- Sesion -->
      <div class="group account">
        <span class="group-title">Sesión · {{ staff?.name }}</span>
        <button type="button" class="group-btn" :aria-expanded="open === 'account'" @click="toggle('account')">
          {{ staff?.name }}
          <ChevronDown class="caret" :size="14" :stroke-width="2" />
        </button>
        <ul class="dropdown align-right" :class="{ open: open === 'account' }">
          <li class="who muted">{{ staff?.name }} · {{ roleLabel }}</li>
          <li>
            <button type="button" class="entry" @click="doLogout">
              <LogOut class="entry-icon" :size="16" :stroke-width="1.8" />
              <span class="entry-label">Salir</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  Coffee,
  ExternalLink,
  History,
  IdCard,
  ImageIcon,
  LogOut,
  Megaphone,
  Package,
  Settings,
  SquarePen,
  Users,
} from "lucide-vue-next";
import type { Component } from "vue";
import { useStaffAuth } from "~/composables/useAuth";
import {
  goToSection,
  sectionsFor,
  STAFF_GROUPS,
  STAFF_SECTIONS,
  useStaffBadges,
  useStaffSection,
  type StaffSectionId,
} from "~/composables/useStaffSections";

interface Entry {
  id: StaffSectionId | "ver-carta";
  label: string;
  badge?: number;
  danger?: boolean;
  external?: boolean;
}

// Icono de cada entrada de menu (la carta publica abre en otra pestaña: icono de enlace externo).
const ENTRY_ICONS: Record<Entry["id"], Component> = {
  cola: ClipboardList,
  tomar: SquarePen,
  historial: History,
  inventario: Package,
  clientes: Users,
  personal: IdCard,
  carta: BookOpen,
  cafe: Coffee,
  portada: ImageIcon,
  novedades: Megaphone,
  pie: Settings,
  "ver-carta": ExternalLink,
};

const { staff, logout } = useStaffAuth();
const section = useStaffSection();
const badges = useStaffBadges();

const roleLabel = computed(() => (staff.value?.role === "gestion" ? "Gestión" : "Barra"));

// Pedidos en cola: aviso normal. Insumos bajo minimo: aviso en rojo.
function badgeFor(id: StaffSectionId) {
  return { badge: badges.value[id] || 0, danger: id === "inventario" };
}

const groups = computed(() => {
  const visible = sectionsFor(staff.value?.role);
  return STAFF_GROUPS.map((g) => {
    const entries: Entry[] = visible
      .filter((s) => s.group === g.id)
      .map((s) => ({ id: s.id, label: s.label, ...badgeFor(s.id) }));
    // La carta publica, para ver como la ve el cliente (en otra pestaña: el panel sigue abierto).
    if (g.id === "web") entries.push({ id: "ver-carta", label: "Ver carta pública", external: true });
    const badge = entries.reduce((sum, e) => sum + (e.badge ?? 0), 0);
    return { ...g, entries, badge, danger: entries.some((e) => e.danger && e.badge) };
  }).filter((g) => g.entries.length);
});

const totalBadge = computed(() => groups.value.reduce((sum, g) => sum + g.badge, 0));
const currentGroup = computed(() => STAFF_SECTIONS.find((s) => s.id === section.value)?.group);
const currentLabel = computed(() => STAFF_SECTIONS.find((s) => s.id === section.value)?.label ?? "Menú");

function entryAttrs(entry: Entry) {
  return entry.external
    ? { href: "/", target: "_blank", rel: "noopener" }
    : { type: "button", "aria-current": entry.id === section.value ? "page" : undefined };
}

// --- Desplegables: uno abierto a la vez; se cierran al elegir, al pulsar fuera o con Escape ---
const open = ref<string | null>(null);
const navEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLElement | null>(null);

// Panel lateral abierto: la pagina de detras no se desplaza y el foco va al boton de cerrar.
watch(open, async (value, previous) => {
  if (!import.meta.client) return;
  const mobileOpen = value === "mobile";
  document.body.style.overflow = mobileOpen ? "hidden" : "";
  if (mobileOpen) {
    await nextTick();
    closeBtn.value?.focus();
  } else if (previous === "mobile") {
    navEl.value?.querySelector<HTMLElement>(".menu-toggle")?.focus();
  }
});

function toggle(id: string) {
  // En movil los grupos van siempre desplegados dentro del panel: el clic en un grupo no lo cierra.
  if (open.value === "mobile" && id !== "mobile" && id !== "account") return;
  open.value = open.value === id ? null : id;
}
function select(entry: Entry) {
  open.value = null;
  if (!entry.external) goToSection(entry.id as StaffSectionId);
}
async function doLogout() {
  open.value = null;
  await logout();
  await navigateTo("/staff");
}

function onPointerDown(e: PointerEvent) {
  if (navEl.value && !navEl.value.contains(e.target as Node)) open.value = null;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = null;
}
// Al pasar de movil a escritorio (o al reves) lo abierto deja de tener sentido: se cierra.
// Mismo corte que el @media del estilo.
let mobileQuery: MediaQueryList | null = null;
const closeAll = () => (open.value = null);
onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeydown);
  mobileQuery = window.matchMedia("(max-width: 760px)");
  mobileQuery.addEventListener("change", closeAll);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKeydown);
  mobileQuery?.removeEventListener("change", closeAll);
  document.body.style.overflow = "";
});
</script>

<style scoped>
.staff-nav { position: relative; display: flex; align-items: center; }

.group-btn,
.entry,
.menu-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
}
.group-btn,
.menu-toggle {
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 6px 0;
  border-bottom: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.group-btn:hover, .menu-toggle:hover { color: var(--text); }
.group.active > .group-btn { color: var(--accent); border-bottom-color: var(--accent); }
.caret { flex-shrink: 0; }

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  background: var(--accent);
  color: var(--bg);
  border-radius: 100px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0;
  padding: 0 5px;
}
.badge.danger { background: var(--danger); }

.group-title { display: none; }
.menu-toggle { display: none; }

/* --- Escritorio: grupos en linea con desplegables --- */
.menu { display: flex; align-items: center; gap: 22px; }
.group { position: relative; }
.dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  left: -12px;
  min-width: 200px;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 60;
}
.dropdown.align-right { left: auto; right: -12px; }
.dropdown.open { display: block; }
.entry {
  width: 100%;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  color: var(--text);
  font-size: 14.5px;
  text-align: left;
}
.entry:hover { background: var(--surface); }
.entry.current { color: var(--accent); font-weight: 600; }
.entry-icon { flex-shrink: 0; opacity: 0.8; }
.entry-label { flex: 1; }
.group-btn.single.current { color: var(--accent); border-bottom-color: var(--accent); }
.who { padding: 8px 12px 6px; font-size: 13px; }

/* --- Movil: boton "seccion actual ☰" y panel con todos los grupos desplegados --- */
.backdrop, .panel-head { display: none; }

/* --- Movil: hamburguesa y panel lateral que entra desde la derecha --- */
@media (max-width: 760px) {
  .menu-toggle {
    display: inline-flex;
    position: relative;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    color: var(--text);
  }
  .burger { display: flex; flex-direction: column; justify-content: space-between; width: 22px; height: 16px; }
  .burger span { display: block; height: 2px; border-radius: 2px; background: currentColor; }
  .toggle-badge { position: absolute; top: 2px; right: 0; }

  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.25s ease, visibility 0s linear 0.25s;
    z-index: 90;
  }
  .backdrop.visible { opacity: 1; visibility: visible; transition: opacity 0.25s ease; }

  .menu {
    display: flex;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 85vw);
    overflow-y: auto;
    overscroll-behavior: contain;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px 8px 24px;
    background: var(--bg);
    border-left: 1px solid var(--border-strong);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.14);
    transform: translateX(100%);
    visibility: hidden;
    transition: transform 0.25s ease, visibility 0s linear 0.25s;
    z-index: 100;
  }
  .menu.mobile-open { transform: translateX(0); visibility: visible; transition: transform 0.25s ease; }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 8px 12px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-serif);
    font-size: 17px;
  }
  .close {
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover { color: var(--text); }

  .group + .group { border-top: 1px solid var(--border); padding-top: 4px; }
  .group-title {
    display: block;
    padding: 10px 12px 2px;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .group-btn:not(.single) { display: none; }
  .group-btn.single {
    width: 100%;
    justify-content: space-between;
    padding: 12px;
    color: var(--text);
    font-size: 15px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    border-bottom: none;
  }
  .group-btn.single.current { color: var(--accent); font-weight: 600; }
  .entry { padding: 12px; font-size: 15px; }
  .dropdown,
  .dropdown.align-right {
    display: block;
    position: static;
    min-width: 0;
    padding: 0;
    border: none;
    box-shadow: none;
    background: transparent;
  }
  .account .who { display: none; }
}

@media (max-width: 760px) and (prefers-reduced-motion: reduce) {
  .menu, .menu.mobile-open, .backdrop, .backdrop.visible { transition: none; }
}
</style>
