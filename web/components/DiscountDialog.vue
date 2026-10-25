<template>
  <!-- Descuento de un pedido: en porcentaje o en pesos, con motivo obligatorio. Se abre con
       open(descuento actual o null); "Aplicar" emite apply(descuento) y "Quitar" apply(null).
       Quien lo usa lo guarda y cierra con close() (o muestra el error con la prop `error`). -->
  <dialog ref="dialog" class="discount-dialog" aria-labelledby="discount-dialog-title" @click.self="close">
    <form class="discount-dialog-body" @submit.prevent="apply">
      <div class="discount-dialog-head">
        <h2 id="discount-dialog-title">Descuento</h2>
        <button type="button" class="close" aria-label="Cerrar" @click="close">×</button>
      </div>

      <div class="mode" role="radiogroup" aria-label="Tipo de descuento">
        <button type="button" role="radio" :aria-checked="mode === 'percent'" :class="{ active: mode === 'percent' }" @click="mode = 'percent'">
          Porcentaje
        </button>
        <button type="button" role="radio" :aria-checked="mode === 'amount'" :class="{ active: mode === 'amount' }" @click="mode = 'amount'">
          Importe
        </button>
      </div>

      <template v-if="mode === 'percent'">
        <div class="quick" aria-label="Porcentajes rápidos">
          <button v-for="p in QUICK_PERCENTS" :key="p" type="button" class="quick-btn" :class="{ active: percent === p }" @click="percent = p">
            {{ p }} %
          </button>
        </div>
        <label class="field">
          <span class="muted">Otro porcentaje</span>
          <input v-model.number="percent" type="number" min="1" max="100" step="1" inputmode="numeric" placeholder="%" />
        </label>
      </template>
      <label v-else class="field">
        <span class="muted">Pesos que se descuentan</span>
        <input :value="amountText" type="text" inputmode="numeric" autocomplete="off" placeholder="Importe" @input="onAmountInput" />
      </label>

      <fieldset class="field reasons">
        <legend class="muted">Motivo</legend>
        <label v-for="(label, key) in DISCOUNT_REASON_LABELS" :key="key" class="reason" :class="{ active: reason === key }">
          <input v-model="reason" type="radio" name="discount-reason" :value="key" />
          {{ label }}
        </label>
      </fieldset>
      <label class="field">
        <span class="muted">{{ reason === "OTRO" ? "¿Por qué?" : "Nota (opcional)" }}</span>
        <input v-model="note" type="text" maxlength="120" :placeholder="reason === 'OTRO' ? 'P. ej. cumpleaños de un cliente' : ''" />
      </label>

      <dl class="preview">
        <div><dt>Pedido</dt><dd>{{ formatPrice(grossCents) }}</dd></div>
        <div><dt>Descuento</dt><dd>− {{ formatPrice(amount) }}</dd></div>
        <div class="final"><dt>A cobrar</dt><dd>{{ formatPrice(Math.max(grossCents - amount, 0)) }}</dd></div>
      </dl>

      <p v-if="shownProblem" class="muted error" role="alert">{{ shownProblem }}</p>

      <div class="actions">
        <button class="button" type="submit" :disabled="busy || !!problem">{{ busy ? "Guardando…" : "Aplicar" }}</button>
        <button v-if="hadDiscount" class="button secondary cancel" type="button" :disabled="busy" @click="emit('apply', null)">
          Quitar descuento
        </button>
        <button class="button secondary" type="button" :disabled="busy" @click="close">Volver</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { useStaffAuth } from "~/composables/useAuth";
import {
  DISCOUNT_REASON_LABELS,
  discountAmount,
  discountProblem,
  type DiscountInput,
  type DiscountReason,
} from "~/composables/useStaffOrders";

const props = defineProps<{ grossCents: number; busy?: boolean; error?: string | null }>();
const emit = defineEmits<{ apply: [discount: DiscountInput | null] }>();

const QUICK_PERCENTS = [10, 20, 50, 100];

const { staff } = useStaffAuth();
const dialog = ref<HTMLDialogElement | null>(null);
const mode = ref<"percent" | "amount">("percent");
const percent = ref<number | "" | null>(null);
const amountCents = ref<number | null>(null);
const reason = ref<DiscountReason | null>(null);
const note = ref("");
const hadDiscount = ref(false);
// Los avisos de lo que falta (motivo, cantidad) solo despues de intentar aplicar.
const tried = ref(false);

const amountText = computed(() => (amountCents.value === null ? "" : amountCents.value.toLocaleString("es-CO")));
function onAmountInput(event: Event) {
  const el = event.target as HTMLInputElement;
  const digits = el.value.replace(/\D/g, "");
  amountCents.value = digits ? Number(digits) : null;
  el.value = amountText.value;
}
// Solo el campo del modo elegido cuenta (el otro conserva lo escrito por si se vuelve a el).
const size = computed(() => ({
  percent: mode.value === "percent" && typeof percent.value === "number" ? percent.value : null,
  amountCents: mode.value === "amount" ? amountCents.value : null,
}));
const amount = computed(() => discountAmount(size.value, props.grossCents));
const percentValid = computed(() => {
  const p = size.value.percent;
  return p === null || (Number.isInteger(p) && p >= 1 && p <= 100);
});
// Lo que falla por la cantidad (pasarse del pedido o del tope de barra), sea cual sea el motivo.
const sizeProblem = computed(() => {
  if (!percentValid.value) return "El porcentaje debe ser un número entero entre 1 y 100";
  if (amount.value < 1) return null;
  return discountProblem({ ...size.value, reason: "INVITACION", note: null }, props.grossCents, staff.value?.role);
});
const problem = computed(() => {
  if (sizeProblem.value) return sizeProblem.value;
  if (amount.value < 1) return "Indica cuánto se descuenta";
  if (!reason.value) return "Elige el motivo del descuento";
  return discountProblem({ ...size.value, reason: reason.value, note: note.value }, props.grossCents, staff.value?.role);
});
// Pasarse y los errores de la API se avisan en cuanto ocurren; lo que falta, al intentar aplicar.
const shownProblem = computed(() => props.error || sizeProblem.value || (tried.value ? problem.value : null));

/** Abre con el descuento que ya tiene el pedido (para cambiarlo o quitarlo) o vacio. */
function open(existing?: { percent?: number | null; amountCents?: number | null; reason: DiscountReason; note?: string | null } | null) {
  hadDiscount.value = !!existing;
  tried.value = false;
  mode.value = existing && !existing.percent ? "amount" : "percent";
  percent.value = existing?.percent ?? null;
  amountCents.value = existing && !existing.percent ? existing.amountCents ?? null : null;
  reason.value = existing?.reason ?? null;
  note.value = existing?.note ?? "";
  dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
}
function apply() {
  tried.value = true;
  if (props.busy || problem.value || !reason.value) return;
  emit("apply", { ...size.value, reason: reason.value, note: note.value.trim() || null });
}

defineExpose({ open, close });

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.discount-dialog {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
}
.discount-dialog::backdrop { background: rgba(0, 0, 0, 0.35); }
.discount-dialog-body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
.discount-dialog-head { display: flex; align-items: center; justify-content: space-between; }
.discount-dialog-head h2 { margin: 0; }
.close {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.mode { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.mode button, .quick-btn {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.mode button.active, .quick-btn.active { background: var(--accent); color: var(--bg); }
.quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.reasons { border: none; margin: 0; padding: 0; }
.reasons legend { padding: 0; margin-bottom: 6px; }
.reason {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  cursor: pointer;
}
.reason + .reason { margin-top: 6px; }
.reason.active { border-color: var(--accent); }
.reason input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
.preview { margin: 0; padding: 12px 14px; border-radius: 10px; background: var(--surface-alt); display: flex; flex-direction: column; gap: 4px; }
.preview div { display: flex; justify-content: space-between; gap: 12px; }
.preview dt { color: var(--text-muted); }
.preview dd { margin: 0; font-variant-numeric: tabular-nums; }
.preview .final { font-weight: 700; font-size: 18px; }
.preview .final dt { color: var(--text); }
.error { color: var(--danger); margin: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions .button { min-height: 44px; }
</style>
