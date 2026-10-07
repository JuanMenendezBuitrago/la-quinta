<template>
  <div>
    <header class="topbar">
      <NuxtLink :to="inStaff && staff ? '/staff' : '/'" class="brand" aria-label="La Quinta">
        <!-- En movil, el logotipo compacto "La 5ta"; en el resto, el horizontal "laquintaesencia" -->
        <img src="/logo-laquintaesencia.png" alt="La Quinta" class="brand-logo brand-logo--wide" width="694" height="76" />
        <img src="/logo.png" alt="La Quinta" class="brand-logo brand-logo--compact" width="268" height="115" />
      </NuxtLink>
      <!-- En el panel de personal, su propio menu: carrito y "mi cuenta" son cosas del cliente -->
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
        <NuxtLink to="/cuenta" aria-label="Mi cuenta" title="Mi cuenta"><User :size="22" :stroke-width="1.7" /></NuxtLink>
      </nav>
    </header>
    <NuxtPage />
    <SiteFooter />
    <StaffQuickBar v-if="inStaff && staff" />
  </div>
</template>

<script setup lang="ts">
import { BookOpen, ShoppingBag, User } from "lucide-vue-next";
import { useCart } from "~/composables/useCart";
import { restoreSession, useStaffAuth } from "~/composables/useAuth";
import { TABLES, useCustomerTable } from "~/composables/useTables";
import { useCustomerOrdering } from "~/composables/useSiteSettings";
import StaffNav from "~/components/StaffNav.vue";
import StaffQuickBar from "~/components/StaffQuickBar.vue";

const { cartCount, clear: clearCart } = useCart();
// Si se activa "solo el personal crea pedidos", el carrito deja de existir para el cliente.
const canOrder = useCustomerOrdering();
watch(canOrder, (enabled) => {
  if (!enabled) clearCart();
});
const { staff } = useStaffAuth();
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
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-wrap: wrap;
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
