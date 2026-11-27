<template>
  <!-- Al menos todo el alto de la pantalla: con poco contenido, el pie queda pegado abajo -->
  <div class="app-shell">
    <header class="topbar">
      <NuxtLink :to="inStaff && staff ? '/staff' : '/'" class="brand" aria-label="La Quinta">
        <!-- En movil, el logotipo compacto "La 5ta"; en el resto, el horizontal "laquintaesencia" -->
        <img src="/logo-laquintaesencia.png" alt="La Quinta" class="brand-logo brand-logo--wide" width="694" height="76" />
        <img src="/logo-5ta.svg" alt="La Quinta" class="brand-logo brand-logo--compact" width="245" height="102" />
      </NuxtLink>
      <!-- Cuenta compartida: quien la usa, a un toque (en vez de hacer login cada vez). En
           escritorio a la derecha, junto al menu; en movil, en una fila propia debajo, centrada. -->
      <div v-if="inStaff && staff?.shared && staff.actingAs" class="acting-row">
        <StaffActingSwitcher />
      </div>
      <div class="topbar-end">
      <!-- En el panel de personal, su propio menu: carrito y "mi cuenta" son cosas del cliente -->
      <CashFloatNotice v-if="inStaff && staff?.role === 'gestion'" />
      <StaffNav v-if="inStaff && staff" />
      <nav v-else-if="inStaff">
        <NuxtLink to="/">Ver carta</NuxtLink>
      </nav>
      <!-- Cliente: solo iconos; el nombre va en aria-label (lectores de pantalla) y title (al pasar el raton) -->
      <nav v-else class="icon-nav">
        <NuxtLink to="/" aria-label="Carta" title="Carta"><BookOpen :size="22" :stroke-width="1.7" /></NuxtLink>
        <NuxtLink
          v-if="canOrder"
          to="/carrito"
          :aria-label="cartCount ? `Carrito (${cartCount})` : 'Carrito'"
          title="Carrito"
        >
          <ShoppingBag :size="22" :stroke-width="1.7" />
          <span v-if="cartCount" class="badge" aria-hidden="true">{{ cartCount }}</span>
        </NuxtLink>
        <NuxtLink
          to="/cuenta"
          :aria-label="customer ? 'Mi cuenta' : 'Entra o regístrate'"
          :title="customer ? 'Mi cuenta' : 'Entra o regístrate'"
          :class="{ 'signup-link': !customer }"
        >
          <UserAvatar v-if="customer" :avatar="customer.avatar" :name="customer.name" :size="26" />
          <template v-else>
            <!-- Sin sesion: invitacion a crear cuenta junto al icono (en movil, solo «Regístrate») -->
            <span class="signup-text" aria-hidden="true"><span class="signup-long">Entra o </span>regístrate</span>
            <User :size="22" :stroke-width="1.7" />
          </template>
        </NuxtLink>
      </nav>
      </div>
    </header>
    <div class="app-body">
      <NuxtPage />
    </div>
    <!-- El pie (direccion, horarios, redes) es para el cliente: no en el panel de personal -->
    <SiteFooter v-if="!inStaff" />
    <StaffQuickBar v-if="inStaff && staff" />
    <!-- Aviso de version nueva tras un despliegue (solo en el navegador: depende del service worker) -->
    <ClientOnly><UpdateBanner /></ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { BookOpen, ShoppingBag, User } from "lucide-vue-next";
import { useCart } from "~/composables/useCart";
import { restoreSession, useAuth, useStaffAuth } from "~/composables/useAuth";
import { TABLES, useCustomerTable } from "~/composables/useTables";
import { useCustomerOrdering } from "~/composables/useSiteSettings";
import StaffNav from "~/components/StaffNav.vue";
import CashFloatNotice from "~/components/CashFloatNotice.vue";
import StaffActingSwitcher from "~/components/StaffActingSwitcher.vue";
import StaffQuickBar from "~/components/StaffQuickBar.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import UpdateBanner from "~/components/UpdateBanner.vue";

const { cartCount, clear: clearCart } = useCart();
// Si se activa "solo el personal crea pedidos", el carrito deja de existir para el cliente.
const canOrder = useCustomerOrdering();
watch(canOrder, (enabled) => {
  if (!enabled) clearCart();
});

const { staff } = useStaffAuth();
const { customer } = useAuth();
const route = useRoute();
const inStaff = computed(() => route.path === "/staff" || route.path.startsWith("/staff/"));

// ?mesa=3 (o ?mesa=barra), p. ej. desde un QR en la mesa: el cliente pide desde el local.
const customerTable = useCustomerTable();
watch(
  () => route.query.mesa,
  (mesa) => {
    const value = typeof mesa === "string" ? mesa.trim().toLowerCase() : "";
    const table = TABLES.find((t) => t.id.toLowerCase() === value);
    if (table) customerTable.value = table.id;
  },
  { immediate: true }
);

// Recupera la sesion (cliente o personal) a partir de la cookie del token.
await useAsyncData("session", async () => {
  await restoreSession();
  return true;
});
</script>

<style scoped>
.app-shell { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; }
.app-body { flex: 1 0 auto; }
.topbar-end { display: flex; align-items: center; gap: 14px; min-width: 0; margin-left: auto; }
/* Selector de personas: a la derecha, justo antes del menu */
.acting-row { display: flex; min-width: 0; margin-left: auto; }
.acting-row + .topbar-end { margin-left: 4px; }
.acting-row > .acting-switcher { max-width: 100%; }
.topbar {
  position: sticky;
  top: 0;
  /* Por encima de la barra inferior del personal (80): el panel lateral del menu movil vive
     dentro de esta cabecera y su z-index (90/100) solo cuenta dentro de ella. Con 50 la barra
     inferior tapaba las ultimas filas del panel. */
  z-index: 85;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-wrap: nowrap;
  gap: 10px;
}
.brand {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: 19px;
  letter-spacing: 0.02em;
  color: var(--text);
  text-decoration: none;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
/* Logotipo por altura: el horizontal (694x76) en escritorio y tablet, el compacto (268x115) en movil */
.brand-logo {
  display: block;
  height: 30px;
  width: auto;
  max-width: 60vw;
  object-fit: contain;
}
.brand-logo--compact { display: none; height: 36px; }
@media (max-width: 760px) {
  .brand-logo--wide { display: none; }
  .brand-logo--compact { display: block; }
  /* Movil: los avatares en una segunda fila a todo el ancho, centrados (si no caben, se desplazan) */
  .topbar { flex-wrap: wrap; }
  .acting-row { order: 3; flex: 1 1 100%; margin-left: 0; }
  .acting-row + .topbar-end { margin-left: auto; }
  .acting-row > .acting-switcher { margin: 0 auto; }
}
nav {
  display: flex;
  align-items: center;
  gap: 22px;
}
nav a {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  position: relative;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
nav a:hover { color: var(--text); }
nav a.router-link-exact-active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
/* Iconos del cliente: mas juntos que los textos, con el contador del carrito sobre el icono */
.icon-nav { gap: 18px; }
.icon-nav a { padding: 4px 2px; }
/* Sin sesion: el texto «Entra o regístrate» a la izquierda del icono de cuenta */
.icon-nav a.signup-link { gap: 7px; }
.signup-text { white-space: nowrap; }
@media (max-width: 760px) {
  .signup-long { display: none; }
  .icon-nav a.signup-link { font-size: 11px; letter-spacing: 0.04em; }
}
.icon-nav .badge {
  position: absolute;
  top: -4px;
  right: -10px;
  margin-left: 0;
}
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
  padding: 0 5px;
  margin-left: 5px;
}
</style>
