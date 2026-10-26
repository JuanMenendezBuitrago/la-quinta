<template>
  <!-- Rebajas de un pedido: el canje de sellos del cliente (un producto gratis, ver `lines` y
       `customer`) y/o un descuento en porcentaje o en pesos con motivo, calculado sobre lo que queda
       tras el canje. Se abre con open(lo que ya tiene el pedido); "Aplicar" emite apply({ redemption,
       discount }) (null: sin el) y "Quitar" apply con los dos a null. Quien lo usa lo guarda y
       cierra con close() (o muestra el error con la prop `error`). -->
  <dialog ref="dialog" class="discount-dialog" aria-labelledby="discount-dialog-title" @click.self="close">
    <form class="discount-dialog-body" @submit.prevent="apply">
      <div class="discount-dialog-head">
        <h2 id="discount-dialog-title">Descuento</h2>
        <button type="button" class="close" aria-label="Cerrar" @click="close">×</button>
      </div>

      <!-- Canje de sellos: solo con cliente identificado -->
      <section v-if="customer" class="redeem" :class="{ active: redeem }">
        <label class="redeem-toggle">
          <input v-model="redeem" type="checkbox" :disabled="!canRedeem" />
          <span>
            <strong>Canje de sellos</strong>
            <span class="muted">{{ canRedeem ? "Un producto gratis; se restan los sellos al cliente." : "El cliente todavía no tiene sellos suficientes." }}</span>
          </span>
        </label>
        <fieldset v-if="redeem" class="field reasons">
          <legend class="muted">Producto gratis</legend>
          <label v-for="(line, i) in lines" :key="i" class="reason" :class="{ active: lineIndex === i }">
            <input v-model="lineIndex" type="radio" name="discount-line" :value="i" :disabled="line.priceCents < 1" />
            <span class="line-name">{{ line.name }}<span v-if="line.quantity > 1" class="muted"> (1 de {{ line.quantity }})</span></span>
            <span class="muted">{{ formatPrice(line.priceCents) }}</span>
          </label>
        </fieldset>
      </section>

      <p v-if="customer" class="section-title">
        <strong>Otro descuento</strong>
        <span v-if="redeem" class="muted"> (opcional, sobre lo que queda tras el canje)</span>
        <button v-if="redeem && discountWanted" type="button" class="link-button" @click="clearDiscount">Sin descuento</button>
      </p>
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
          <button v-for="p in QUICK_PERCENTS" :key="p" type="button" class="quick-btn" :class="{ active: percent === p }" @click="percent = percent === p ? null : p">
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
        <label v-for="(label, key) in MANUAL_REASONS" :key="key" class="reason" :class="{ active: reason === key }">
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
        <div v-if="redeem"><dt>Canje de sellos</dt><dd>− {{ formatPrice(redeemCents) }}</dd></div>
        <div v-if="!redeem || discountWanted"><dt>Descuento</dt><dd>− {{ formatPrice(amount) }}</dd></div>
        <div class="final"><dt>A cobrar</dt><dd>{{ formatPrice(Math.max(baseCents - amount, 0)) }}</dd></div>
      </dl>

      <p v-if="shownProblem" class="muted error" role="alert">{{ shownProblem }}</p>

      <div class="actions">
        <button class="button" type="submit" :disabled="busy || !!problem">{{ busy ? "Guardando…" : "Aplicar" }}</button>
        <button v-if="hadAny" class="button secondary cancel" type="button" :disabled="busy" @click="emit('apply', { redemption: null, discount: null })">
          Quitar {{ hadRedeem && hadDiscount ? "todo" : hadRedeem ? "canje" : "descuento" }}
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
  redemptionAmount,
  redemptionProblem,
  type DiscountInput,
  type DiscountLine,
  type DiscountReason,
  type OrderDiscounts,
} from "~/composables/useStaffOrders";

// lines y customer: para el canje de sellos (sin cliente identificado no se ofrece).
// grossCents: el pedido sin canje ni descuento (productos + empaque).
const props = defineProps<{
  grossCents: number;
  lines?: DiscountLine[];
  customer?: { rewardAvailable?: boolean | null } | null;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ apply: [value: OrderDiscounts] }>();

const QUICK_PERCENTS = [10, 20, 50, 100];
// El canje va en su propio bloque: en la lista de motivos solo los descuentos a mano.
const MANUAL_REASONS = Object.fromEntries(
  Object.entries(DISCOUNT_REASON_LABELS).filter(([key]) => key !== "CANJE")
) as Record<Exclude<DiscountReason, "CANJE">, string>;

const { staff } = useStaffAuth();
const dialog = ref<HTMLDialogElement | null>(null);
const redeem = ref(false);
const lineIndex = ref<number | null>(null);
const mode = ref<"percent" | "amount">("percent");
const percent = ref<number | "" | null>(null);
const amountCents = ref<number | null>(null);
const reason = ref<DiscountReason | null>(null);
const note = ref("");
const hadDiscount = ref(false);
// Si ya tenia el canje, los sellos estan restados: se puede cambiar el producto aunque no queden mas.
const hadRedeem = ref(false);
const hadAny = computed(() => hadDiscount.value || hadRedeem.value);
// El descuento con el que se abrio: si no se toca, la API lo recalcula sin volver a mirar el tope.
const original = ref<DiscountInput | null>(null);
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

const redemption = computed(() => (redeem.value ? { lineIndex: lineIndex.value } : null));
const redeemCents = computed(() => (redemption.value ? redemptionAmount(redemption.value, lines.value) : 0));
// El descuento se calcula sobre lo que queda tras el canje, como en la API.
const baseCents = computed(() => Math.max(props.grossCents - redeemCents.value, 0));

// Solo el campo del modo elegido cuenta (el otro conserva lo escrito por si se vuelve a el).
const size = computed(() => ({
  percent: mode.value === "percent" && typeof percent.value === "number" ? percent.value : null,
  amountCents: mode.value === "amount" ? amountCents.value : null,
}));
const rawAmount = computed(() => discountAmount(size.value, baseCents.value));
// Con el canje, el descuento es opcional: cuenta en cuanto se pone una cantidad o un motivo.
const discountWanted = computed(() => rawAmount.value >= 1 || !!reason.value || size.value.percent !== null);
const discount = computed<DiscountInput | null>(() =>
  discountWanted.value && reason.value ? { ...size.value, reason: reason.value, note: note.value.trim() || null } : null
);
const unchanged = computed(() => {
  const o = original.value;
  const d = discount.value;
  if (!o || !d || o.reason !== d.reason || (o.note || null) !== d.note) return false;
  return o.percent ? o.percent === d.percent : d.percent === null && o.amountCents === d.amountCents;
});
// El descuento que ya tenia no se vuelve a validar (lo aplico quien podia): como en la API, un
// importe fijo no pasa de lo que queda tras el canje.
const amount = computed(() => (unchanged.value ? Math.min(rawAmount.value, baseCents.value) : rawAmount.value));
const percentValid = computed(() => {
  const p = size.value.percent;
  return p === null || (Number.isInteger(p) && p >= 1 && p <= 100);
});
// Lo que falla por la cantidad (pasarse del pedido o del tope de barra), sea cual sea el motivo.
const sizeProblem = computed(() => {
  if (!percentValid.value) return "El porcentaje debe ser un número entero entre 1 y 100";
  if (amount.value < 1 || unchanged.value) return null;
  return discountProblem({ ...size.value, reason: "INVITACION", note: null }, baseCents.value, staff.value?.role);
});
const redeemProblem = computed(() => {
  if (!redemption.value) return null;
  if (!canRedeem.value) return "El cliente todavía no tiene sellos suficientes para canjear";
  return redemptionProblem(redemption.value, lines.value);
});
const problem = computed(() => {
  if (redeemProblem.value) return redeemProblem.value;
  if (!discountWanted.value) return redeem.value ? null : "Indica cuánto se descuenta";
  if (sizeProblem.value) return sizeProblem.value;
  if (amount.value < 1) return "Indica cuánto se descuenta";
  if (!reason.value) return "Elige el motivo del descuento";
  return unchanged.value ? null : discountProblem(discount.value!, baseCents.value, staff.value?.role);
});
// Pasarse y los errores de la API se avisan en cuanto ocurren; lo que falta, al intentar aplicar.
const shownProblem = computed(() => props.error || sizeProblem.value || (tried.value ? problem.value : null));

/**
 * Abre con lo que ya tiene el pedido (para cambiarlo o quitarlo) o vacio. withRedeem: marca ya el
 * canje (p. ej. desde el aviso "Aplicar canje").
 */
function open(
  existing?: {
    redemption?: { lineIndex: number | null } | null;
    discount?: { percent?: number | null; amountCents?: number | null; reason: DiscountReason; note?: string | null } | null;
  } | null,
  withRedeem = false
) {
  const d = existing?.discount ?? null;
  const r = existing?.redemption ?? null;
  hadDiscount.value = !!d;
  hadRedeem.value = !!r;
  original.value = d ? { percent: d.percent ?? null, amountCents: d.percent ? null : d.amountCents ?? null, reason: d.reason, note: d.note ?? null } : null;
  tried.value = false;
  redeem.value = !!r || (withRedeem && !!props.customer?.rewardAvailable);
  // Por defecto, el producto mas barato (el que canjearia la API sin eleccion).
  const cheapest = cheapestLineIndex(lines.value);
  lineIndex.value = r?.lineIndex ?? (cheapest === -1 ? null : cheapest);
  mode.value = d && !d.percent ? "amount" : "percent";
  percent.value = d?.percent ?? null;
  amountCents.value = d && !d.percent ? d.amountCents ?? null : null;
  reason.value = d?.reason ?? null;
  note.value = d?.note ?? "";
  dialog.value?.showModal();
}
function clearDiscount() {
  percent.value = null;
  amountCents.value = null;
  reason.value = null;
  note.value = "";
}
function close() {
  dialog.value?.close();
}
function apply() {
  tried.value = true;
  if (props.busy || problem.value) return;
  emit("apply", { redemption: redemption.value, discount: discount.value });
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
.redeem { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--border-strong); border-radius: 10px; }
.redeem.active { border-color: var(--accent); background: var(--accent-soft); color: var(--on-accent-soft); }
.redeem-toggle { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.redeem-toggle input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--accent); flex-shrink: 0; }
.redeem-toggle > span { display: flex; flex-direction: column; gap: 2px; }
.redeem-toggle .muted { font-size: 13px; }
.section-title { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.link-button { border: none; background: none; padding: 2px 0; color: var(--accent); font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
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
