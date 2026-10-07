<template>
  <div>
    <header class="topbar">
      <NuxtLink :to="inStaff && staff ? '/staff' : '/'" class="brand" aria-label="La Quinta">
        <img src="/logo.png" alt="La Quinta" class="brand-logo" />
      </NuxtLink>
      <!-- En el panel de personal, su propio menu: carrito y "mi cuenta" son cosas del cliente -->
      <StaffNav v-if="inStaff && staff" />
      <nav v-else-if="inStaff">
        <NuxtLink to="/">Ver carta</NuxtLink>
      </nav>
      <nav v-else>
        <NuxtLink to="/">Carta</NuxtLink>
        <NuxtLink v-if="canOrder" to="/carrito">Carrito<span v-if="cartCount" class="badge">{{ cartCount }}</span></NuxtLink>
        <NuxtLink to="/cuenta">Mi cuenta</NuxtLink>
      </nav>
    </header>
    <NuxtPage />
    <SiteFooter />
    <StaffQuickBar v-if="inStaff && staff" />
  </div>
</template>

<script setup lang="ts">
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
.brand-logo {
  display: block;
  height: 36px;
  width: auto;
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
