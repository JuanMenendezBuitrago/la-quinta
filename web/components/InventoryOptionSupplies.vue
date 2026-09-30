<template>
  <section v-if="groups.length" class="option-supplies">
    <h3>Opciones de la carta</h3>
    <p class="muted intro">
      Qué insumo es cada opción. Si piden una distinta de la de la receta (un Latte con avena), se
      descuenta este insumo en la misma cantidad en lugar del de la receta. Si no hay nada que
      cambiar (una adición a un té, un jugo en leche en vez de agua), se descuenta la
      <strong>cantidad por unidad</strong> que pongas aquí; sin cantidad, no se descuenta nada.
    </p>
    <div v-for="group in groups" :key="group.id" class="group">
      <strong>{{ group.name }}</strong>
      <div v-for="option in group.options" :key="option.id" class="option-row">
        <span>{{ option.name }}</span>
        <select
          :value="supplyOf(option.id)"
          :disabled="savingId === option.id"
          :aria-label="`Insumo de ${option.name}`"
          @change="save(option.id, ($event.target as HTMLSelectElement).value, savedQty(option.id))"
        >
          <option value="">Sin insumo</option>
          <option v-for="s in supplies" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <template v-if="supplyOf(option.id)">
          <QtyInput
            :key="`${option.id}:${savedQty(option.id)}`"
            :model-value="savedQty(option.id)"
            :unit="unitOf(supplyOf(option.id))"
            placeholder="Cantidad si se añade"
            :aria-label="`Cantidad de ${option.name} si se añade`"
            @update:model-value="qtyDrafts[option.id] = $event"
          />
          <button
            v-if="option.id in qtyDrafts && qtyDrafts[option.id] !== savedQty(option.id)"
            class="button secondary small"
            type="button"
            :disabled="savingId === option.id"
            @click="save(option.id, supplyOf(option.id), qtyDrafts[option.id])"
          >
            Guardar
          </button>
        </template>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { OPTION_SUPPLIES_QUERY, SET_OPTION_SUPPLY, type Supply } from "~/composables/useInventory";
import QtyInput from "~/components/QtyInput.vue";

const props = defineProps<{ supplies: Supply[] }>();

interface OptionGroup {
  id: string;
  name: string;
  options: { id: string; name: string }[];
}

const { result, refetch } = useQuery<{
  modifierGroups: OptionGroup[];
  optionSupplies: { optionId: string; qty: number | null; supply: { id: string } }[];
}>(OPTION_SUPPLIES_QUERY, null, () => ({ fetchPolicy: "cache-and-network" }));

const groups = computed(() => result.value?.modifierGroups ?? []);
const supplies = computed(() => props.supplies.filter((s) => s.active));

function supplyOf(optionId: string) {
  return result.value?.optionSupplies.find((o) => o.optionId === optionId)?.supply.id ?? "";
}
function savedQty(optionId: string) {
  return result.value?.optionSupplies.find((o) => o.optionId === optionId)?.qty ?? null;
}
function unitOf(supplyId: string) {
  return props.supplies.find((s) => s.id === supplyId)?.unit ?? "ud";
}
// Cantidad tecleada y aun sin guardar, por opcion.
const qtyDrafts = reactive<Record<string, number | null>>({});

const savingId = ref("");
const error = ref("");
const { mutate } = useMutation(SET_OPTION_SUPPLY);

async function save(optionId: string, supplyId: string, qty: number | null) {
  savingId.value = optionId;
  error.value = "";
  try {
    await mutate({ optionId, supplyId: supplyId || null, qty: supplyId ? qty : null });
    await refetch();
    delete qtyDrafts[optionId];
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar";
  } finally {
    savingId.value = "";
  }
}
</script>

<style scoped>
.option-supplies { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border); }
.intro { font-size: 14px; margin: 0 0 14px; }
.group { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; max-width: 640px; }
.option-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; font-size: 14px; }
.option-row > span:first-child { width: 110px; }
.option-row select { flex: 1 1 160px; }
.option-row select {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font: inherit;
  font-size: 14px;
}
.error { color: var(--danger); font-size: 14px; }
.button.small { padding: 6px 10px; font-size: 13px; min-height: 36px; flex-shrink: 0; }
</style>
