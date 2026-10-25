<template>
  <!-- Descuento de un pedido: en porcentaje o en pesos, con motivo obligatorio, o el canje de
       sellos del cliente (un producto gratis, ver `lines` y `customer`). Se abre con
       open(descuento actual o null); "Aplicar" emite apply(descuento) y "Quitar" apply(null).
       Quien lo usa lo guarda y cierra con close() (o muestra el error con la prop `error`). -->
  <dialog ref="dialog" class="discount-dialog" aria-labelledby="discount-dialog-title" @click.self="close">
    <form class="discount-dialog-body" @submit.prevent="apply">
      <div class="discount-dialog-head">
        <h2 id="discount-dialog-title">Descuento</h2>
        <button type="button" class="close" aria-label="Cerrar" @click="close">×</button>
      </div>

      <div class="mode" :class="{ 'with-redeem': customer }" role="radiogroup" aria-label="Tipo de descuento">
        <button type="button" role="radio" :aria-checked="mode === 'percent'" :class="{ active: mode === 'percent' }" @click="mode = 'percent'">
          Porcentaje
        </button>
        <button type="button" role="radio" :aria-checked="mode === 'amount'" :class="{ active: mode === 'amount' }" @click="mode = 'amount'">
          Importe
        </button>
        <button v-if="customer" type="button" role="radio" :aria-checked="mode === 'redeem'" :class="{ active: mode === 'redeem' }" @click="mode = 'redeem'">
          Canje de sellos
        </button>
      </div>

      <template v-if="mode === 'redeem'">
        <p v-if="!canRedeem" class="muted">El cliente todavía no tiene sellos suficientes para canjear.</p>
        <fieldset v-else class="field reasons">
          <legend class="muted">Producto gratis (se restan los sellos al cliente)</legend>
          <label v-for="(line, i) in lines" :key="i" class="reason" :class="{ active: lineIndex === i }">
            <input v-model="lineIndex" type="radio" name="discount-line" :value="i" :disabled="line.priceCents < 1" />
            <span class="line-name">{{ line.name }}<span v-if="line.quantity > 1" class="muted"> (1 de {{ line.quantity }})</span></span>
            <span class="muted">{{ formatPrice(line.priceCents) }}</span>
          </label>
        </fieldset>
      </template>
      <template v-else-if="mode === 'percent'">
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
      <label v-else-if="mode === 'amount'" class="field">
        <span class="muted">Pesos que se descuentan</span>
        <input :value="amountText" type="text" inputmode="numeric" autocomplete="off" placeholder="Importe" @input="onAmountInput" />
      </label>

      <fieldset v-if="mode !== 'redeem'" class="field reasons">
        <legend class="muted">Motivo</legend>
        <label v-for="(label, key) in MANUAL_REASONS" :key="key" class="reason" :class="{ active: reason === key }">
          <input v-model="reason" type="radio" name="discount-reason" :value="key" />
          {{ label }}
        </label>
      </fieldset>
      <label v-if="mode !== 'redeem'" class="field">
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
  cheapestLineIndex,
  discountAmount,
  discountProblem,
  type DiscountInput,
  type DiscountLine,
  type DiscountReason,
} from "~/composables/useStaffOrders";

// lines y customer: para el canje de sellos (sin cliente identificado no se ofrece).
const props = defineProps<{
  grossCents: number;
  lines?: DiscountLine[];
  customer?: { rewardAvailable?: boolean | null } | null;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ apply: [discount: DiscountInput | null] }>();

const QUICK_PERCENTS = [10, 20, 50, 100];
// El canje tiene su propio modo: en la lista de motivos solo los descuentos a mano.
const MANUAL_REASONS = Object.fromEntries(
  Object.entries(DISCOUNT_REASON_LABELS).filter(([key]) => key !== "CANJE")
) as Record<Exclude<DiscountReason, "CANJE">, string>;

const { staff } = useStaffAuth();
const dialog = ref<HTMLDialogElement | null>(null);
const mode = ref<"percent" | "amount" | "redeem">("percent");
const percent = ref<number | "" | null>(null);
const amountCents = ref<number | null>(null);
const reason = ref<DiscountReason | null>(null);
const note = ref("");
const lineIndex = ref<number | null>(null);
const hadDiscount = ref(false);
// Si ya es un canje, los sellos estan restados: se puede cambiar el producto aunque no queden mas.
const hadRedeem = ref(false);
const lines = computed(() => props.lines ?? []);
const canRedeem = computed(() => hadRedeem.value || !!props.customer?.rewardAvailable);
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
const redeemInput = computed<DiscountInput>(() => ({ percent: null, amountCents: null, reason: "CANJE", note: null, lineIndex: lineIndex.value }));
const amount = computed(() =>
  mode.value === "redeem" ? discountAmount(redeemInput.value, props.grossCents, lines.value) : discountAmount(size.value, props.grossCents)
);
const percentValid = computed(() => {
  const p = size.value.percent;
  return p === null || (Number.isInteger(p) && p >= 1 && p <= 100);
});
// Lo que falla por la cantidad (pasarse del pedido o del tope de barra), sea cual sea el motivo.
const sizeProblem = computed(() => {
  if (mode.value === "redeem") return null;
  if (!percentValid.value) return "El porcentaje debe ser un número entero entre 1 y 100";
  if (amount.value < 1) return null;
  return discountProblem({ ...size.value, reason: "INVITACION", note: null }, props.grossCents, staff.value?.role);
});
const problem = computed(() => {
  if (mode.value === "redeem") {
    if (!canRedeem.value) return "El cliente todavía no tiene sellos suficientes para canjear";
    return discountProblem(redeemInput.value, props.grossCents, staff.value?.role, lines.value);
  }
  if (sizeProblem.value) return sizeProblem.value;
  if (amount.value < 1) return "Indica cuánto se descuenta";
  if (!reason.value) return "Elige el motivo del descuento";
  return discountProblem({ ...size.value, reason: reason.value, note: note.value }, props.grossCents, staff.value?.role);
});
// Pasarse y los errores de la API se avisan en cuanto ocurren; lo que falta, al intentar aplicar.
const shownProblem = computed(() => props.error || sizeProblem.value || (tried.value ? problem.value : null));

/** Abre con el descuento que ya tiene el pedido (para cambiarlo o quitarlo) o vacio. */
function open(
  existing?: { percent?: number | null; amountCents?: number | null; reason: DiscountReason; note?: string | null; lineIndex?: number | null } | null
) {
  const redeemed = existing?.reason === "CANJE";
  hadDiscount.value = !!existing;
  hadRedeem.value = redeemed;
  tried.value = false;
  // Con la recompensa disponible y sin descuento, se abre directamente en el canje.
  mode.value = redeemed || (!existing && props.customer?.rewardAvailable) ? "redeem" : existing && !existing.percent ? "amount" : "percent";
  percent.value = existing?.percent ?? null;
  amountCents.value = existing && !existing.percent && !redeemed ? existing.amountCents ?? null : null;
  reason.value = existing && !redeemed ? existing.reason : null;
  note.value = existing && !redeemed ? existing.note ?? "" : "";
  // Por defecto, el producto mas barato (el que canjearia la API sin eleccion).
  lineIndex.value = redeemed && existing?.lineIndex != null ? existing.lineIndex : cheapestLineIndex(lines.value);
  if (lineIndex.value === -1) lineIndex.value = null;
  dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
}
function apply() {
  tried.value = true;
  if (props.busy || problem.value) return;
  if (mode.value === "redeem") return emit("apply", redeemInput.value);
  if (!reason.value) return;
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
.mode.with-redeem button:last-child { grid-column: 1 / -1; }
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
.reason .line-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
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
