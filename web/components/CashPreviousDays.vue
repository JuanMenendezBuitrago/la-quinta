<template>
  <!-- Aviso al abrir la caja: lo cobrado en dias anteriores sigue sin cerrar. Se cierra aqui, solo
       hasta el inicio de hoy, para que no se mezcle con lo de hoy (closeCashRegister previousDays). -->
  <div class="previous-days" role="alert">
    <p class="lead">
      <AlertTriangle :size="18" :stroke-width="2" aria-hidden="true" />
      <span>
        <strong>Quedó sin cerrar {{ formatPrice(pending.totalCents) }}</strong>
        {{ rangeLabel }} ({{ pending.ordersCount }} {{ pending.ordersCount === 1 ? "pedido" : "pedidos"
        }}<template v-if="pending.expensesCount">, {{ pending.expensesCount }} {{ pending.expensesCount === 1 ? "gasto" : "gastos" }}</template>).
        Ciérralo antes de abrir la caja de hoy para que no se mezcle con lo de hoy.
      </span>
    </p>

    <form v-if="open" class="form" @submit.prevent="confirming = true">
      <dl class="totals">
        <div><dt>Efectivo cobrado</dt><dd>{{ formatPrice(pending.cashCents) }}</dd></div>
        <div v-if="pending.transferCents"><dt>Transferencia</dt><dd>{{ formatPrice(pending.transferCents) }}</dd></div>
        <div v-if="pending.cardCents"><dt>Tarjeta</dt><dd>{{ formatPrice(pending.cardCents) }}</dd></div>
        <div v-if="pending.unknownMethodCents"><dt>Sin método</dt><dd>{{ formatPrice(pending.unknownMethodCents) }}</dd></div>
        <div v-if="pending.expensesCashCents"><dt>Gastos pagados de la caja</dt><dd>− {{ formatPrice(pending.expensesCashCents) }}</dd></div>
        <div v-if="pending.bankDepositsCents"><dt>Ingresado al banco</dt><dd>− {{ formatPrice(pending.bankDepositsCents) }}</dd></div>
      </dl>
      <label class="field">
        <span class="muted">Fondo con el que empezó ese periodo{{ floatHint }}</span>
        <input v-model.number="float" type="number" min="0" step="50" inputmode="numeric" required />
      </label>
      <label class="field">
        <span class="muted">Efectivo contado en la caja</span>
        <input v-model.number="counted" type="number" min="0" step="50" inputmode="numeric" required />
      </label>
      <p v-if="todayCashCents > 0" class="muted warn">
        Hoy ya se han cobrado {{ formatPrice(todayCashCents) }} en efectivo: no los cuentes, o réstalos de lo contado.
      </p>
      <dl class="totals">
        <div><dt>Debería haber</dt><dd>{{ floatValid ? formatPrice(expected) : "—" }}</dd></div>
        <div v-if="floatValid && countedValid" class="difference" :class="difference === 0 ? 'even' : difference < 0 ? 'short' : 'over'">
          <dt>{{ difference === 0 ? "Cuadra" : difference < 0 ? "Falta" : "Sobra" }}</dt>
          <dd>{{ formatPrice(Math.abs(difference)) }}</dd>
        </div>
      </dl>
      <label class="field">
        <span class="muted">Nota (opcional)</span>
        <textarea v-model="note" rows="2" maxlength="500" />
      </label>
      <p v-if="error" class="muted error" role="alert">{{ error }}</p>

      <div v-if="confirming" class="confirm">
        <p>
          <strong>¿Cerrar hasta el final del {{ lastDayLabel }}?</strong> Lo cobrado hoy queda para el siguiente
          cierre. No se puede deshacer.
        </p>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="saving" @click="confirming = false">No, volver</button>
          <button class="button" type="button" :disabled="saving" @click="submit">
            {{ saving ? "Cerrando…" : "Sí, cerrar" }}
          </button>
        </div>
      </div>
      <div v-else class="form-actions">
        <button class="button secondary" type="button" @click="open = false">Cancelar</button>
        <button class="button" type="submit" :disabled="!floatValid || !countedValid">
          <Lock :size="16" :stroke-width="1.8" aria-hidden="true" />
          Cerrar lo pendiente
        </button>
      </div>
    </form>
    <div v-else class="form-actions">
      <button class="button" type="button" @click="open = true">Cerrar lo del {{ lastDayLabel }}</button>
      <button class="button secondary" type="button" @click="emit('dismiss')">Ahora no</button>
    </div>
  </div>
</template>

<script lang="ts">
// Fuera del <script setup>: un script setup no puede exportar.
export interface PendingPreviousDays {
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
  bankDepositsCents: number;
  openingFloatCents: number | null;
}
export const PREVIOUS_DAYS_FIELDS = `previousDays { periodStart periodEnd ordersCount totalCents cashCents cardCents
  transferCents unknownMethodCents expensesCount expensesCashCents bankDepositsCents openingFloatCents }`;
</script>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { AlertTriangle, Lock } from "lucide-vue-next";
import { useStoreTime } from "~/composables/useStoreTime";

const props = defineProps<{
  pending: PendingPreviousDays;
  /** Lo contado en el ultimo cierre: con lo que se quedo la caja, para proponer el fondo. */
  lastCountedCents: number | null;
  /** Efectivo cobrado hoy: esta en el cajon pero no entra en este cierre. */
  todayCashCents: number;
  format: (cents: number) => string;
}>();
const emit = defineEmits<{ closed: []; dismiss: [] }>();
const formatPrice = props.format;

const { formatDateTime, timeZone } = useStoreTime();

/** Ultimo dia que entra: el anterior al inicio de hoy. */
const lastDayLabel = computed(() =>
  new Date(new Date(props.pending.periodEnd).getTime() - 1).toLocaleDateString("es-ES", { timeZone, weekday: "long", day: "numeric", month: "short" })
);
const rangeLabel = computed(() => `desde el ${formatDateTime(props.pending.periodStart)} hasta el final del ${lastDayLabel.value}`);

const proposedFloat = computed(() => props.pending.openingFloatCents ?? props.lastCountedCents);
const floatHint = computed(() =>
  props.pending.openingFloatCents != null ? " (el anotado al abrir)" : props.lastCountedCents != null ? " (lo contado en el último cierre)" : ""
);

const open = ref(false);
const float = ref<number | "">(proposedFloat.value ?? "");
const counted = ref<number | "">("");
const note = ref("");
const confirming = ref(false);
const saving = ref(false);
const error = ref("");

const floatValid = computed(() => typeof float.value === "number" && float.value >= 0);
const countedValid = computed(() => typeof counted.value === "number" && counted.value >= 0);
const expected = computed(
  () => (floatValid.value ? (float.value as number) : 0) + props.pending.cashCents - props.pending.expensesCashCents - props.pending.bankDepositsCents
);
const difference = computed(() => (countedValid.value ? (counted.value as number) : 0) - expected.value);

const { mutate } = useMutation(gql`
  mutation ClosePreviousDays($openingFloatCents: Int!, $countedCashCents: Int!, $note: String) {
    closeCashRegister(openingFloatCents: $openingFloatCents, countedCashCents: $countedCashCents, note: $note, previousDays: true) {
      id
    }
  }
`);

async function submit() {
  if (!floatValid.value || !countedValid.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await mutate(
      { openingFloatCents: Math.round(float.value as number), countedCashCents: Math.round(counted.value as number), note: note.value.trim() || null },
      { refetchQueries: ["CashOpeningPending"] }
    );
    emit("closed");
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo cerrar";
    confirming.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.previous-days {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}
.lead { display: flex; gap: 8px; margin: 0; font-size: 14px; }
.lead svg { flex-shrink: 0; color: var(--danger); margin-top: 1px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.totals { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.totals div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.totals dt { color: var(--text-muted); }
.totals dd { font-weight: 600; }
.totals dd { margin: 0; font-variant-numeric: tabular-nums; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field input, .field textarea {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 16px;
  font-family: inherit;
}
.warn { margin: 0; font-size: 13px; color: var(--danger); }
.difference dt { font-weight: 700; }
.difference.even dt, .difference.even dd, .difference.over dt, .difference.over dd { color: var(--accent-strong); }
.difference.short dt, .difference.short dd { color: var(--danger); }
.confirm { padding: 10px 12px; border-radius: 6px; border: 1px solid var(--field-border); background: var(--surface-alt); }
.confirm p { margin: 0 0 10px; font-size: 14px; }
.form-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.error { color: var(--danger); margin: 0; }
</style>
