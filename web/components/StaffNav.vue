<template>
  <nav ref="navEl" class="staff-nav" aria-label="Panel de personal">
    <!-- Movil: un solo boton que despliega todo el menu agrupado -->
    <button
      type="button"
      class="menu-toggle"
      :aria-expanded="open === 'mobile'"
      aria-controls="staff-menu"
      @click="toggle('mobile')"
    >
      <span class="current">{{ currentLabel }}</span>
      <span v-if="totalBadge" class="badge" :class="{ danger: badges.inventario }">{{ totalBadge }}</span>
      <span class="burger" aria-hidden="true">☰</span>
    </button>

    <div id="staff-menu" class="menu" :class="{ 'mobile-open': open === 'mobile' }">
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
            {{ group.entries[0].label }}
            <span v-if="group.entries[0].badge" class="badge" :class="{ danger: group.entries[0].danger }">{{ group.entries[0].badge }}</span>
          </component>
        </template>

        <template v-else>
          <span class="group-title">{{ group.label }}</span>
          <button type="button" class="group-btn" :aria-expanded="open === group.id" @click="toggle(group.id)">
            {{ group.label }}
            <span v-if="group.badge" class="badge" :class="{ danger: group.danger }">{{ group.badge }}</span>
            <span class="caret" aria-hidden="true">▾</span>
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
                {{ entry.label }}
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
          <span class="caret" aria-hidden="true">▾</span>
        </button>
        <ul class="dropdown align-right" :class="{ open: open === 'account' }">
          <li class="who muted">{{ staff?.name }} · {{ roleLabel }}</li>
          <li><button type="button" class="entry" @click="doLogout">Salir</button></li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
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
    if (g.id === "web") entries.push({ id: "ver-carta", label: "Ver carta pública ↗", external: true });
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
.caret { font-size: 10px; }

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
.group-btn.single.current { color: var(--accent); border-bottom-color: var(--accent); }
.who { padding: 8px 12px 6px; font-size: 13px; }

/* --- Movil: boton "seccion actual ☰" y panel con todos los grupos desplegados --- */
@media (max-width: 760px) {
  .menu-toggle { display: inline-flex; color: var(--text); }
  .current { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .burger { font-size: 16px; }

  .menu {
    display: none;
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: min(320px, calc(100vw - 32px));
    max-height: calc(100vh - 90px);
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
    z-index: 60;
  }
  .menu.mobile-open { display: flex; }
  .group + .group { border-top: 1px solid var(--border); padding-top: 4px; }
  .group-title {
    display: block;
    padding: 8px 12px 2px;
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
    padding: 10px 12px;
    color: var(--text);
    font-size: 14.5px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    border-bottom: none;
  }
  .group-btn.single.current { font-weight: 600; }
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
</style>
