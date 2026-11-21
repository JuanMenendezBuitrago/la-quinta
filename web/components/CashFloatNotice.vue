<template>
  <!-- Aviso en la barra superior mientras no se haya anotado el fondo inicial del periodo de caja
       (ver «Apertura de caja» en el cierre de caja). Al tocarlo, lleva alli. Se vuelve a mirar cada
       minuto y al guardar el fondo o cerrar la caja (refetchQueries "CashOpeningPending"). -->
  <button v-if="pending" type="button" class="float-notice" title="Anota el fondo inicial de la caja"
    aria-label="Sin fondo de caja: anótalo en el cierre de caja"
    @click="goToSection('caja')">
    <Banknote :size="15" :stroke-width="1.9" aria-hidden="true" />
    <span class="label">Sin fondo de caja</span>
  </button>
</template>

<script setup lang="ts">
import { Banknote } from "lucide-vue-next";
import { gql } from "graphql-tag";
import { goToSection } from "~/composables/useStaffSections";

const { result } = useQuery<{ cashOpeningPending: boolean }>(
  gql`query CashOpeningPending { cashOpeningPending }`,
  null,
  { pollInterval: 60_000, fetchPolicy: "cache-and-network" }
);
// Solo en el navegador: en SSR no se sabe y asi no aparece y desaparece al hidratar.
const mounted = ref(false);
onMounted(() => (mounted.value = true));
const pending = computed(() => mounted.value && result.value?.cashOpeningPending === true);
</script>

<style scoped>
.float-notice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: 100px;
  background: transparent;
  color: var(--danger);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.float-notice:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
/* Movil: solo el icono, para no apretar la barra */
@media (max-width: 640px) {
  .float-notice { padding: 6px; }
  .label { display: none; }
}
</style>
