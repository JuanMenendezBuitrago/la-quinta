<template>
  <!-- Filtros del historial: cada cambio vuelve a pedir el historial a la API -->
  <div class="card history-filters">
    <div class="filters-grid">
      <label class="field">
        <span class="muted">Desde</span>
        <input v-model="from" type="date" :max="to || undefined" />
      </label>
      <label class="field">
        <span class="muted">Hasta</span>
        <input v-model="to" type="date" :min="from || undefined" />
      </label>
      <label class="field">
        <span class="muted">Personal</span>
        <select v-model="staffId">
          <option value="">Todo el personal</option>
          <option v-for="s in staffOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <!-- A todo el ancho: el buscador de cliente necesita sitio para "Código (LQ-1234) o teléfono" -->
      <div class="field field--full">
        <span class="muted">Cliente</span>
        <div v-if="customer" class="customer-chip">
          <UserAvatar :avatar="customer.avatar" :name="customer.name" :size="24" />
          <strong>{{ customer.name }}</strong>
          <button class="link-button" type="button" @click="customer = null">Quitar</button>
        </div>
        <CustomerLookup v-else icon-only @found="customer = $event" />
      </div>
    </div>
    <button v-if="active" class="link-button clear" type="button" @click="clear">Quitar filtros</button>
  </div>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import CustomerLookup from "~/components/CustomerLookup.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import { useStoreTime } from "~/composables/useStoreTime";
import type { CustomerMatch, HistoryFilter } from "~/composables/useStaffOrders";

const emit = defineEmits<{ (e: "change", filter: HistoryFilter): void }>();

// Las mismas cuentas activas que la pantalla de entrada (consulta publica: nombre y avatar).
const STAFF_OPTIONS = gql`
  query HistoryStaffOptions {
    staffLoginOptions {
      id
      name
    }
  }
`;
const { result } = useQuery<{ staffLoginOptions: { id: string; name: string }[] }>(STAFF_OPTIONS);
const staffOptions = computed(() => result.value?.staffLoginOptions ?? []);

const { fromStoreInput } = useStoreTime();
const from = ref("");
const to = ref("");
const staffId = ref("");
const customer = ref<CustomerMatch | null>(null);

const active = computed(() => !!(from.value || to.value || staffId.value || customer.value));

/** "YYYY-MM-DD" del dia siguiente (el filtro "hasta" incluye todo ese dia). */
function nextDay(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// Los dias son de la tienda: medianoche en su zona horaria, no en la del navegador.
watch([from, to, staffId, customer], () => {
  emit("change", {
    from: from.value ? fromStoreInput(`${from.value}T00:00`).toISOString() : null,
    to: to.value ? fromStoreInput(`${nextDay(to.value)}T00:00`).toISOString() : null,
    staffId: staffId.value || null,
    customerId: customer.value?.id ?? null,
  });
});

function clear() {
  from.value = "";
  to.value = "";
  staffId.value = "";
  customer.value = null;
}
</script>

<style scoped>
.history-filters { display: flex; flex-direction: column; gap: 10px; }
.filters-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: start; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field--full { grid-column: 1 / -1; }
.field input, .field select {
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
}
.customer-chip { display: flex; align-items: center; gap: 8px; min-height: 40px; }
.customer-chip strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
.clear { align-self: flex-start; }
</style>
