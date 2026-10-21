<template>
  <section class="cash">
    <!-- Periodo actual: lo cobrado, los gastos y el arqueo. En pantallas anchas apaisadas, a la
         izquierda; los cierres anteriores, en una columna a la derecha. -->
    <div class="cash-current">
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
        <div class="total"><dt>Total cobrado</dt><dd>{{ formatPrice(summary.totalCents) }}</dd></div>
        <div v-if="summary.expensesCount"><dt><Receipt :size="16" :stroke-width="1.8" aria-hidden="true" /> Gastos</dt><dd>− {{ formatPrice(summary.expensesTotalCents) }}</dd></div>
        <div v-if="summary.expensesCount" class="total"><dt>Resultado neto</dt><dd>{{ formatPrice(summary.netCents) }}</dd></div>
      </dl>
      <p v-if="summary.unknownMethodCents" class="muted hint">
        «Sin método»: pedidos para llevar o web entregados antes de que se pidiera el método de pago al entregar.
      </p>
      <BalanceTable :balances="summary.balances" :format="formatPrice" />
    </div>

    <!-- Gastos que entraran en este cierre -->
    <div v-if="summary" class="card expenses">
      <div class="expenses-head">
        <h2 class="card-title">Gastos del periodo</h2>
        <button v-if="!adding" class="button secondary" type="button" @click="startAdd">
          <Plus :size="16" :stroke-width="1.8" aria-hidden="true" />
          Añadir gasto
        </button>
      </div>
      <ExpenseForm v-if="adding" @saved="onExpenseSaved" @cancel="adding = false" />
      <p v-if="!pending.length && !adding" class="muted">Sin gastos registrados en este periodo.</p>
      <ul v-if="pending.length" class="expense-list">
        <li v-for="e in pending" :key="e.id" class="expense">
          <ExpenseForm v-if="editingId === e.id" :existing="e" @saved="onExpenseSaved" @cancel="editingId = ''" />
          <template v-else>
            <div class="expense-main">
              <strong>{{ e.description }}</strong>
              <span class="muted">
                {{ EXPENSE_CATEGORY_LABELS[e.category] }}<template v-if="e.supplier"> · {{ e.supplier }}</template> ·
                {{ EXPENSE_METHOD_LABELS[e.method] }} · {{ formatDateTime(e.spentAt) }} · {{ e.staffName }}
              </span>
            </div>
            <span class="expense-amount" :class="{ cash: e.method === 'CAJA' }">− {{ formatPrice(e.amountCents) }}</span>
            <div class="expense-actions">
              <button
                v-if="e.receiptUrl"
                type="button"
                class="icon-btn"
                :aria-label="`Ver recibo de ${e.description}`"
                title="Ver recibo"
                @click="openLightbox(resolveImageUrl(e.receiptUrl)!)"
              >
                <ImageIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
              </button>
              <!-- Corregir o borrar: solo gestion (el servidor tambien lo comprueba) -->
              <template v-if="isGestion">
                <button type="button" class="icon-btn" :aria-label="`Editar ${e.description}`" title="Editar" @click="editingId = e.id">
                  <Pencil :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  :aria-label="`Borrar ${e.description}`"
                  title="Borrar"
                  @click="deletingId = deletingId === e.id ? '' : e.id"
                >
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </template>
            </div>
            <div v-if="deletingId === e.id" class="confirm delete-confirm" role="alert">
              <p><strong>¿Borrar este gasto?</strong> No se puede deshacer.</p>
              <div class="form-actions">
                <button class="button secondary" type="button" @click="deletingId = ''">No, mantener</button>
                <button class="button secondary cancel" type="button" :disabled="deleting" @click="removeExpense(e.id)">
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                  Sí, borrar
                </button>
              </div>
            </div>
          </template>
        </li>
      </ul>
      <p v-if="expenseError" class="muted error" role="alert">{{ expenseError }}</p>
      <dl v-if="pending.length" class="totals expenses-totals">
        <div><dt>Pagado de la caja</dt><dd>{{ formatPrice(summary.expensesCashCents) }}</dd></div>
        <div><dt>Otros métodos</dt><dd>{{ formatPrice(summary.expensesOtherCents) }}</dd></div>
      </dl>
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
        <div>
          <dt>Debería haber (fondo + efectivo cobrado{{ summary.expensesCashCents ? " − gastos de la caja" : "" }})</dt>
          <dd>{{ formatPrice(expectedInDrawer) }}</dd>
        </div>
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

    </div>

    <!-- Historial de cierres -->
    <div class="cash-history">
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
      <p v-if="c.expensesCount" class="closing-figures">
        Gastos {{ formatPrice(c.expensesTotalCents) }} (de la caja {{ formatPrice(c.expensesCashCents) }}) · Neto
        {{ formatPrice(c.netCents) }}
      </p>
      <p class="muted">
        Fondo {{ formatPrice(c.openingFloatCents) }} · Debería haber {{ formatPrice(c.expectedCashInDrawerCents) }} ·
        Contado {{ formatPrice(c.countedCashCents) }}
      </p>
      <p v-if="c.note" class="muted note">Nota: {{ c.note }}</p>
      <button v-if="c.expensesCount" type="button" class="link-button" @click="toggleClosingExpenses(c.id)">
        {{ openClosingId === c.id ? "Ocultar detalle" : `Ver detalle y gastos (${c.expensesCount})` }}
      </button>
      <BalanceTable v-if="openClosingId === c.id" :balances="c.balances" :format="formatPrice" />
      <ul v-if="openClosingId === c.id" class="expense-list closed">
        <li v-for="e in closingExpenses" :key="e.id" class="expense">
          <div class="expense-main">
            <strong>{{ e.description }}</strong>
            <span class="muted">
              {{ EXPENSE_CATEGORY_LABELS[e.category] }}<template v-if="e.supplier"> · {{ e.supplier }}</template> ·
              {{ EXPENSE_METHOD_LABELS[e.method] }} · {{ formatDateTime(e.spentAt) }} · {{ e.staffName }}
            </span>
          </div>
          <span class="expense-amount" :class="{ cash: e.method === 'CAJA' }">− {{ formatPrice(e.amountCents) }}</span>
          <div class="expense-actions">
            <button
              v-if="e.receiptUrl"
              type="button"
              class="icon-btn"
              :aria-label="`Ver recibo de ${e.description}`"
              title="Ver recibo"
              @click="openLightbox(resolveImageUrl(e.receiptUrl)!)"
            >
              <ImageIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>
    </article>
    </div>

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Banknote, Check, CircleHelp, CreditCard, ImageIcon, Lock, Pencil, Plus, Receipt, Smartphone, Trash2 } from "lucide-vue-next";
import { useStoreTime } from "~/composables/useStoreTime";
import { useStaffAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import { useImageUrl } from "~/composables/useImageUrl";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_FIELDS, EXPENSE_METHOD_LABELS, type Expense } from "~/composables/useExpenses";
import ExpenseForm from "~/components/ExpenseForm.vue";
import ImageLightbox from "~/components/ImageLightbox.vue";
import BalanceTable, { type MethodBalance } from "~/components/CashBalanceTable.vue";

interface CashSummary {
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  unknownMethodCents: number;
  expensesCount: number;
  expensesCashCents: number;
  expensesOtherCents: number;
  expensesTotalCents: number;
  netCents: number;
  balances: MethodBalance[];
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

const SUMMARY_FIELDS = `periodStart periodEnd ordersCount totalCents cashCents cardCents transferCents unknownMethodCents
  expensesCount expensesCashCents expensesOtherCents expensesTotalCents netCents
  balances { method inCents outCents balanceCents }`;
const CASH_QUERY = gql`
  query CashClosingData {
    cashSummary { ${SUMMARY_FIELDS} }
    pendingExpenses { ${EXPENSE_FIELDS} }
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
const CLOSING_EXPENSES = gql`
  query ClosingExpenses($closingId: ID!) {
    closingExpenses(closingId: $closingId) { ${EXPENSE_FIELDS} }
  }
`;
const DELETE_EXPENSE = gql`
  mutation DeleteExpense($id: ID!) {
    deleteExpense(id: $id)
  }
`;

const { result, error, refetch } = useQuery<{
  cashSummary: CashSummary;
  pendingExpenses: Expense[];
  cashClosings: CashClosing[];
}>(CASH_QUERY, null, { fetchPolicy: "network-only" });
const { mutate: closeCash } = useMutation(CLOSE_CASH);

const summary = computed(() => result.value?.cashSummary ?? null);
const closings = computed(() => result.value?.cashClosings ?? []);
const lastClosing = computed(() => closings.value[0] ?? null);
const summaryError = computed(() => (error.value ? "No se pudo cargar la caja." : ""));
const pending = computed(() => result.value?.pendingExpenses ?? []);

// --- Gastos: cualquiera los añade; corregir y borrar, solo gestion ---
const { staff } = useStaffAuth();
const isGestion = computed(() => staff.value?.role === "gestion");
const { lightboxUrl, openLightbox, closeLightbox } = useLightbox();
const { resolveImageUrl } = useImageUrl();
const adding = ref(false);
const editingId = ref("");
const deletingId = ref("");
const deleting = ref(false);
const expenseError = ref("");
const { mutate: deleteExpenseMutation } = useMutation(DELETE_EXPENSE);

function startAdd() {
  editingId.value = "";
  adding.value = true;
}
// Tras guardar, se vuelve a pedir todo: el resumen y el arqueo dependen de los gastos.
async function onExpenseSaved() {
  adding.value = false;
  editingId.value = "";
  expenseError.value = "";
  await refetch();
}
async function removeExpense(id: string) {
  deleting.value = true;
  expenseError.value = "";
  try {
    await deleteExpenseMutation({ id });
    deletingId.value = "";
    await refetch();
  } catch (err: any) {
    expenseError.value = err?.message ?? "No se pudo borrar el gasto";
  } finally {
    deleting.value = false;
  }
}

// Gastos de un cierre del historial: se piden al abrirlos.
const openClosingId = ref("");
const closingExpenses = ref<Expense[]>([]);
async function toggleClosingExpenses(closingId: string) {
  if (openClosingId.value === closingId) {
    openClosingId.value = "";
    return;
  }
  const { data } = await useNuxtApp().$apollo.defaultClient.query({
    query: CLOSING_EXPENSES,
    variables: { closingId },
    fetchPolicy: "network-only",
  });
  closingExpenses.value = data?.closingExpenses ?? [];
  openClosingId.value = closingId;
}

// El fondo suele repetirse de un dia a otro: se propone el del ultimo cierre.
const openingFloat = ref<number | "">("");
watch(lastClosing, (last) => {
  if (openingFloat.value === "" && last) openingFloat.value = last.openingFloatCents;
}, { immediate: true });
const countedCash = ref<number | "">("");
const note = ref("");

const floatValid = computed(() => typeof openingFloat.value === "number" && openingFloat.value >= 0);
const countedValid = computed(() => typeof countedCash.value === "number" && countedCash.value >= 0);
const expectedInDrawer = computed(
  () =>
    (floatValid.value ? (openingFloat.value as number) : 0) +
    (summary.value?.cashCents ?? 0) -
    (summary.value?.expensesCashCents ?? 0)
);
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
.cash-current, .cash-history { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
/* Pantallas anchas y apaisadas: mas ancho que la pagina (como la cola) y dos columnas, con el
   periodo actual a la izquierda y el historial a la derecha. */
@media (min-width: 1000px) and (orientation: landscape) {
  .cash {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-areas: "current history";
    align-items: start;
    gap: 28px;
    max-width: none;
    width: min(1160px, calc(100vw - 40px));
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }
  .cash-current { grid-area: current; }
  .cash-history { grid-area: history; }
  .cash-history .history-title { margin-top: 0; }
}
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

.expenses { display: flex; flex-direction: column; gap: 12px; }
.expenses-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.expense-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.expense {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--field-border);
}
.expense:last-child { border-bottom: none; }
.expense .expense-form, .expense .delete-confirm { flex-basis: 100%; }
.expense-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 180px; }
.expense-main .muted { font-size: 13px; }
.expense-amount { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.expense-amount.cash { color: var(--danger); }
.expense-actions { display: flex; gap: 4px; }
.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--field-border);
  border-radius: 50%;
  background: none;
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn.danger { color: var(--danger); }
.icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.expenses-totals { border-top: 1px solid var(--field-border); padding-top: 8px; }
.expense-list.closed { margin-top: 8px; }
.link-button {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 4px 0 0;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
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
