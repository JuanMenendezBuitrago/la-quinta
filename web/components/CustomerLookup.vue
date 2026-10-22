<template>
  <form class="customer-lookup" @submit.prevent="search">
    <input
      v-model="query"
      type="text"
      placeholder="Nombre, código (LQ-1234) o teléfono"
      aria-label="Nombre, código o teléfono del cliente"
      autocomplete="off"
    />
    <button
      class="button secondary icon-search"
      type="submit"
      :disabled="!query.trim() || searching"
      :aria-label="searching ? 'Buscando cliente…' : 'Buscar cliente'"
      title="Buscar"
    >
      <Search :size="18" :stroke-width="1.8" aria-hidden="true" />
    </button>
    <p v-if="message" class="muted lookup-message">{{ message }}</p>
    <!-- Varias coincidencias por nombre: se elige una -->
    <ul v-if="matches.length" class="lookup-matches" aria-label="Clientes encontrados">
      <li v-for="m in matches" :key="m.id">
        <button type="button" class="lookup-match" @click="choose(m)">
          <UserAvatar :avatar="m.avatar" :name="m.name" :size="28" />
          <span class="match-name">{{ m.name }}</span>
          <span class="match-code">{{ m.customerCode }}</span>
        </button>
      </li>
    </ul>
  </form>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Search } from "lucide-vue-next";
import type { CustomerMatch } from "~/composables/useStaffOrders";
import UserAvatar from "~/components/UserAvatar.vue";

const emit = defineEmits<{ (e: "found", customer: CustomerMatch): void }>();

// Codigo, telefono o email exactos, o parte del nombre (ver searchCustomers en la API: como mucho
// 8 por nombre; el listado completo de clientes sigue siendo solo de gestion).
const SEARCH = gql`
  query SearchCustomers($query: String!) {
    searchCustomers(query: $query) {
      id
      name
      customerCode
      avatar
    }
  }
`;

const query = ref("");
const searching = ref(false);
const message = ref("");
const matches = ref<CustomerMatch[]>([]);

// Al cambiar lo escrito, la lista de una busqueda anterior ya no vale.
watch(query, () => {
  matches.value = [];
  message.value = "";
});

function choose(customer: CustomerMatch) {
  emit("found", customer);
  query.value = "";
}

async function search() {
  searching.value = true;
  message.value = "";
  matches.value = [];
  try {
    const text = query.value.trim();
    const { data } = await useNuxtApp().$apollo.defaultClient.query({
      query: SEARCH,
      variables: { query: text },
      fetchPolicy: "network-only",
    });
    const found: CustomerMatch[] = data.searchCustomers ?? [];
    if (found.length === 1) choose(found[0]);
    else if (found.length) matches.value = found;
    else if (text.replace(/[^\p{L}]/gu, "").length < 3 && !/\d/.test(text)) message.value = "Escribe al menos 3 letras del nombre.";
    else message.value = "No hay ningún cliente con ese nombre, código o teléfono.";
  } catch (err: any) {
    message.value = err?.message ?? "No se pudo buscar el cliente";
  } finally {
    searching.value = false;
  }
}
</script>

<style scoped>
.customer-lookup { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.customer-lookup input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.lookup-message { grid-column: span 2; margin: 0; font-size: 13px; }
.lookup-matches {
  grid-column: span 2;
  list-style: none;
  margin: 0;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--field-border);
  border-radius: 10px;
  background: var(--surface);
}
.lookup-match {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 14.5px;
  text-align: left;
  cursor: pointer;
}
.lookup-match:hover, .lookup-match:focus-visible { background: var(--surface-alt); outline: none; }
.match-name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-code { flex-shrink: 0; font-size: 12.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.icon-search { width: 44px; height: 44px; padding: 0; border-color: var(--field-border); }
.icon-search:disabled { cursor: not-allowed; }
</style>
