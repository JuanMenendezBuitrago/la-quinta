<template>
  <div class="count-view">
    <p class="muted intro">
      Cuenta lo que hay de verdad y anótalo. Solo se guardan los insumos que rellenes; el resto
      queda igual. La diferencia con el stock teórico queda registrada como «Conteo».
    </p>

    <p v-if="savedMessage" class="card saved" role="status">
      {{ savedMessage }}
      <button class="button secondary" type="button" @click="savedMessage = ''">Cerrar</button>
    </p>

    <p v-if="loading && !active.length" class="muted">Cargando insumos…</p>
    <p v-else-if="!active.length" class="muted">No hay insumos activos que contar.</p>

    <template v-if="!reviewing">
      <section v-for="group in groups" :key="group.title" class="group">
        <h3>{{ group.title }}</h3>
        <ul class="count-list">
          <li v-for="supply in group.items" :key="supply.id" class="count-row">
            <div class="count-info">
              <span class="count-name">{{ supply.name }}</span>
              <span class="muted">Teórico: {{ formatQty(supply.stock, supply.unit) }}</span>
            </div>
            <QtyInput v-model="counted[supply.id]" :unit="supply.unit" placeholder="Contado" :aria-label="`Contado de ${supply.name}`" />
          </li>
        </ul>
      </section>
    </template>

    <!-- Revision antes de guardar -->
    <section v-else class="card review">
      <h3>Revisa el conteo</h3>
      <ul class="diff-list">
        <li v-for="row in diffs" :key="row.supply.id">
          <span>{{ row.supply.name }}</span>
          <span>
            {{ formatQty(row.counted, row.supply.unit) }}
            <strong :class="{ neg: row.diff < 0, pos: row.diff > 0 }">
              ({{ row.diff === 0 ? "cuadra" : formatDelta(row.diff, row.supply.unit) }})
            </strong>
          </span>
        </li>
      </ul>
      <label class="field">
        <span class="muted">Nota (opcional)</span>
        <input v-model="note" type="text" maxlength="200" placeholder="Ej. cierre semanal" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <div v-if="diffs.length" class="sticky-bar">
      <span>{{ diffs.length }} {{ diffs.length === 1 ? "insumo contado" : "insumos contados" }}</span>
      <div class="bar-actions">
        <template v-if="!reviewing">
          <button class="button secondary" type="button" @click="reset">Vaciar</button>
          <button class="button" type="button" @click="reviewing = true">Revisar</button>
        </template>
        <template v-else>
          <button class="button secondary" type="button" :disabled="saving" @click="reviewing = false">Volver</button>
          <button class="button" type="button" :disabled="saving" @click="save">{{ saving ? "Guardando…" : "Guardar conteo" }}</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDelta, formatQty, RECORD_COUNT, SUPPLIES_QUERY, type Supply } from "~/composables/useInventory";
import QtyInput from "~/components/QtyInput.vue";

const { result, loading } = useQuery<{ supplies: Supply[] }>(SUPPLIES_QUERY, null, () => ({
  fetchPolicy: "cache-and-network",
}));
const active = computed(() => (result.value?.supplies ?? []).filter((s) => s.active));

const groups = computed(() => {
  const byCategory = new Map<string, Supply[]>();
  for (const s of active.value) {
    const key = s.category || "Sin categoría";
    byCategory.set(key, [...(byCategory.get(key) ?? []), s]);
  }
  return [...byCategory.entries()].map(([title, items]) => ({ title, items }));
});

const counted = ref<Record<string, number | null>>({});
const reviewing = ref(false);
const note = ref("");
const saving = ref(false);
const error = ref("");
const savedMessage = ref("");

const diffs = computed(() =>
  active.value
    .filter((s) => counted.value[s.id] !== null && counted.value[s.id] !== undefined)
    .map((s) => {
      const value = counted.value[s.id] as number;
      return { supply: s, counted: value, diff: Math.round((value - s.stock) * 100) / 100 };
    })
);

function reset() {
  counted.value = {};
  note.value = "";
  reviewing.value = false;
  error.value = "";
}

const { mutate: recordCount } = useMutation(RECORD_COUNT);

async function save() {
  saving.value = true;
  error.value = "";
  try {
    const total = diffs.value.length;
    const mismatched = diffs.value.filter((d) => d.diff !== 0).length;
    await recordCount({
      counts: diffs.value.map((d) => ({ supplyId: d.supply.id, countedQty: d.counted })),
      note: note.value.trim() || null,
    });
    reset();
    savedMessage.value = `Conteo guardado: ${total} ${total === 1 ? "insumo" : "insumos"}, ${mismatched} con diferencia.`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar el conteo";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.count-view { padding-bottom: 72px; }
.intro { font-size: 14px; margin: 0 0 14px; }
.saved { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; border-color: var(--accent); }
.group { margin-bottom: 18px; }
.group h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 6px; }
.count-list { list-style: none; padding: 0; margin: 0; }
.count-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 11em);
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.count-info { display: flex; flex-direction: column; min-width: 0; }
.count-name { font-weight: 600; overflow-wrap: anywhere; }
.review { display: flex; flex-direction: column; gap: 12px; }
.review h3 { margin: 0; }
.diff-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.diff-list li { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.neg { color: var(--danger); }
.pos { color: var(--accent-strong); }
.field { display: flex; flex-direction: column; gap: 6px; }
.field input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.error { color: var(--danger); margin: 0; }
.sticky-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg);
  border-top: 1px solid var(--border-strong);
  z-index: 10;
}
.bar-actions { display: flex; gap: 8px; }
</style>
