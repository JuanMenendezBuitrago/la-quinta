<template>
  <section class="cash">
    <p v-if="summaryError" class="muted error" role="alert">{{ summaryError }}</p>

    <!-- Lo cobrado desde el ultimo cierre -->
    <div v-if="summary" class="card">
      <h2 class="card-title">Cobrado desde {{ lastClosing ? "el último cierre" : "el inicio del día" }}</h2>
      <p class="muted period">
        {{ formatDateTime(summary.periodStart) }} → ahora · {{ summary.ordersCount }}
        {{ summary.ordersCount === 1 ? "pedido" : "pedidos" }}
      </p>
      <dl class="totals">
        <div><dt><Banknote :size="16" :stroke-width="1.8" aria-hidden="true" /> Efectivo</dt><dd>{{ formatPrice(summary.cashCents) }}</dd></div>
        <div><dt><CreditCard :size="16" :stroke-width="1.8" aria-hidden="true" /> Tarjeta</dt><dd>{{ formatPrice(summary.cardCents) }}</dd></div>
        <div><dt><Smartphone :size="16" :stroke-width="1.8" aria-hidden="true" /> Transferencia</dt><dd>{{ formatPrice(summary.transferCents) }}</dd></div>
        <div v-if="summary.unknownMethodCents">
          <dt><CircleHelp :size="16" :stroke-width="1.8" aria-hidden="true" /> Sin método</dt>
          <dd>{{ formatPrice(summary.unknownMethodCents) }}</dd>
        </div>
        <div class="total"><dt>Total</dt><dd>{{ formatPrice(summary.totalCents) }}</dd></div>
      </dl>
      <p v-if="summary.unknownMethodCents" class="muted hint">
        «Sin método»: pedidos para llevar o web entregados antes de que se pidiera el método de pago al entregar.
      </p>
    </div>

    <!-- Arqueo del efectivo y cierre -->
    <form v-if="summary" class="card closing-form" @submit.prevent="confirming = true">
      <h2 class="card-title">Arqueo del efectivo</h2>
      <label class="field">
        <span class="muted">Fondo inicial (cambio con el que se abrió la caja)</span>
        <input v-model.number="openingFloat" type="number" min="0" step="50" inputmode="numeric" required />
      </label>
      <label class="field">
        <span class="muted">Efectivo contado en la caja</span>
        <input v-model.number="countedCash" type="number" min="0" step="50" inputmode="numeric" required />
      </label>

      <dl class="totals">
        <div><dt>Debería haber (fondo + efectivo cobrado)</dt><dd>{{ formatPrice(expectedInDrawer) }}</dd></div>
        <div v-if="countedValid" class="difference" :class="differenceClass(difference)">
          <dt>{{ differenceLabel(difference) }}</dt>
          <dd>{{ formatPrice(Math.abs(difference)) }}</dd>
        </div>
      </dl>

      <label class="field">
        <span class="muted">Nota (opcional)</span>
        <textarea v-model="note" rows="2" maxlength="500" placeholder="P. ej. un pedido se cobró dos veces" />
      </label>

      <p v-if="closeError" class="muted error" role="alert">{{ closeError }}</p>

      <div v-if="confirming" class="confirm" role="alert">
        <p>
          <strong>¿Cerrar la caja ahora?</strong> Se guardan las cifras y el siguiente cierre empezará desde este
          momento. No se puede deshacer.
        </p>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="closing" @click="confirming = false">No, volver</button>
          <button class="button" type="button" :disabled="closing" @click="closeRegister">
            <Check :size="16" :stroke-width="2" aria-hidden="true" />
            {{ closing ? "Cerrando…" : "Sí, cerrar caja" }}
          </button>
        </div>
      </div>
      <button v-else class="button" type="submit" :disabled="!countedValid || !floatValid">
        <Lock :size="16" :stroke-width="1.8" aria-hidden="true" />
        Cerrar caja
      </button>
      <p v-if="justClosed" class="muted ok" role="status">Caja cerrada ✓</p>
    </form>

    <!-- Historial de cierres -->
    <h2 class="history-title">Cierres anteriores</h2>
    <p v-if="!closings.length" class="muted">Todavía no hay ningún cierre.</p>
    <article v-for="c in closings" :key="c.id" class="card closing">
      <header class="closing-head">
        <strong>{{ formatDateTime(c.periodEnd) }}</strong>
        <span class="difference-badge" :class="differenceClass(c.differenceCents)">
          {{ differenceLabel(c.differenceCents) }}{{ c.differenceCents ? ` ${formatPrice(Math.abs(c.differenceCents))}` : "" }}
        </span>
      </header>
      <p class="muted">
        Desde {{ formatDateTime(c.periodStart) }} · {{ c.staffName }} · {{ c.ordersCount }}
        {{ c.ordersCount === 1 ? "pedido" : "pedidos" }}
      </p>
      <p class="closing-figures">
        Total {{ formatPrice(c.totalCents) }} · Efectivo {{ formatPrice(c.cashCents) }} · Tarjeta
        {{ formatPrice(c.cardCents) }} · Transferencia {{ formatPrice(c.transferCents) }}<template
          v-if="c.unknownMethodCents"
        > · Sin método {{ formatPrice(c.unknownMethodCents) }}</template>
      </p>
      <p class="muted">
        Fondo {{ formatPrice(c.openingFloatCents) }} · Debería haber {{ formatPrice(c.expectedCashInDrawerCents) }} ·
        Contado {{ formatPrice(c.countedCashCents) }}
      </p>
      <p v-if="c.note" class="muted note">Nota: {{ c.note }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Banknote, Check, CircleHelp, CreditCard, Lock, Smartphone } from "lucide-vue-next";
import { useStoreTime } from "~/composables/useStoreTime";

interface CashSummary {
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  unknownMethodCents: number;
}
interface CashClosing extends CashSummary {
  id: string;
  staffName: string;
  openingFloatCents: number;
  countedCashCents: number;
  expectedCashInDrawerCents: number;
  differenceCents: number;
  note: string | null;
}

const SUMMARY_FIELDS = `periodStart periodEnd ordersCount totalCents cashCents cardCents transferCents unknownMethodCents`;
const CASH_QUERY = gql`
  query CashClosingData {
    cashSummary { ${SUMMARY_FIELDS} }
    cashClosings(limit: 30) {
      id ${SUMMARY_FIELDS} staffName openingFloatCents countedCashCents expectedCashInDrawerCents differenceCents note
    }
  }
`;
const CLOSE_CASH = gql`
  mutation CloseCashRegister($openingFloatCents: Int!, $countedCashCents: Int!, $note: String) {
    closeCashRegister(openingFloatCents: $openingFloatCents, countedCashCents: $countedCashCents, note: $note) {
      id
    }
  }
`;

const { formatDateTime } = useStoreTime();
const { result, error, refetch } = useQuery<{ cashSummary: CashSummary; cashClosings: CashClosing[] }>(CASH_QUERY, null, {
  fetchPolicy: "network-only",
});
const { mutate: closeCash } = useMutation(CLOSE_CASH);

const summary = computed(() => result.value?.cashSummary ?? null);
const closings = computed(() => result.value?.cashClosings ?? []);
const lastClosing = computed(() => closings.value[0] ?? null);
const summaryError = computed(() => (error.value ? "No se pudo cargar la caja." : ""));

// El fondo suele repetirse de un dia a otro: se propone el del ultimo cierre.
const openingFloat = ref<number | "">("");
watch(lastClosing, (last) => {
  if (openingFloat.value === "" && last) openingFloat.value = last.openingFloatCents;
}, { immediate: true });
const countedCash = ref<number | "">("");
const note = ref("");

const floatValid = computed(() => typeof openingFloat.value === "number" && openingFloat.value >= 0);
const countedValid = computed(() => typeof countedCash.value === "number" && countedCash.value >= 0);
const expectedInDrawer = computed(() => (floatValid.value ? (openingFloat.value as number) : 0) + (summary.value?.cashCents ?? 0));
const difference = computed(() => (countedValid.value ? (countedCash.value as number) - expectedInDrawer.value : 0));

function differenceLabel(cents: number) {
  return cents === 0 ? "Cuadra" : cents < 0 ? "Falta" : "Sobra";
}
function differenceClass(cents: number) {
  return cents === 0 ? "even" : cents < 0 ? "short" : "over";
}
function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

const confirming = ref(false);
const closing = ref(false);
const closeError = ref("");
const justClosed = ref(false);

async function closeRegister() {
  if (!countedValid.value || !floatValid.value) return;
  closing.value = true;
  closeError.value = "";
  try {
    await closeCash({
      openingFloatCents: Math.round(openingFloat.value as number),
      countedCashCents: Math.round(countedCash.value as number),
      note: note.value.trim() || null,
    });
    countedCash.value = "";
    note.value = "";
    confirming.value = false;
    justClosed.value = true;
    setTimeout(() => (justClosed.value = false), 4000);
    await refetch();
  } catch (err: any) {
    closeError.value = err?.message ?? "No se pudo cerrar la caja";
    confirming.value = false;
    await refetch()?.catch(() => {});
  } finally {
    closing.value = false;
  }
}
</script>

<style scoped>
.cash { display: flex; flex-direction: column; gap: 16px; max-width: 560px; }
.card-title { font-size: 17px; margin: 0 0 4px; }
.period { margin: 0 0 12px; font-size: 13px; }
.totals { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.totals > div { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.totals dt { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); }
.totals dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.totals .total { border-top: 1px solid var(--field-border); padding-top: 6px; margin-top: 2px; }
.totals .total dt { color: var(--text); font-weight: 700; }
.hint { font-size: 12.5px; margin: 10px 0 0; }

.closing-form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field input, .field textarea {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 16px;
  font-family: inherit;
}
/* Diferencia del arqueo: verde-azulado si cuadra o sobra, rojo si falta */
.difference.even dt, .difference.even dd, .difference.over dt, .difference.over dd { color: var(--accent-strong); }
.difference.short dt, .difference.short dd { color: var(--danger); }
.difference dt { font-weight: 700; }

.confirm {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--field-border);
  background: var(--surface-alt);
}
.confirm p { margin: 0 0 10px; font-size: 14px; }
.form-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.error { color: var(--danger); margin: 0; }
.ok { color: var(--accent-strong); margin: 0; }

.history-title { font-size: 17px; margin: 12px 0 0; }
.closing p { margin: 4px 0 0; }
.closing-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.closing-figures { font-size: 14px; }
.note { font-style: italic; }
.difference-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--bg);
  background: var(--accent-strong);
}
.difference-badge.short { background: var(--danger); }
</style>
