<template>
  <form class="customer-lookup" @submit.prevent="search">
    <input
      v-model="query"
      type="text"
      placeholder="Código (LQ-1234) o teléfono"
      aria-label="Código de cliente o teléfono"
      autocomplete="off"
    />
    <button class="button secondary" type="submit" :disabled="!query.trim() || searching">
      {{ searching ? "Buscando…" : "Buscar" }}
    </button>
    <p v-if="message" class="muted lookup-message">{{ message }}</p>
  </form>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import type { CustomerMatch } from "~/composables/useStaffOrders";

const emit = defineEmits<{ (e: "found", customer: CustomerMatch): void }>();

// Busqueda exacta por codigo, telefono o email (ver lookupCustomer en la API): el personal de
// barra no tiene acceso al listado de clientes, solo puede identificar a quien le da su dato.
const LOOKUP = gql`
  query LookupCustomer($query: String!) {
    lookupCustomer(query: $query) {
      id
      name
      customerCode
    }
  }
`;

const query = ref("");
const searching = ref(false);
const message = ref("");

async function search() {
  searching.value = true;
  message.value = "";
  try {
    const { data } = await useNuxtApp().$apollo.defaultClient.query({
      query: LOOKUP,
      variables: { query: query.value.trim() },
      fetchPolicy: "network-only",
    });
    if (data.lookupCustomer) {
      emit("found", data.lookupCustomer);
      query.value = "";
    } else {
      message.value = "No hay ningún cliente con ese código o teléfono.";
    }
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
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}
.lookup-message { grid-column: span 2; margin: 0; font-size: 13px; }
</style>
