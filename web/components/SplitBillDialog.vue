<template>
  <!-- Cuenta dividida: cada persona paga su parte, por productos (lo que tomo), a partes iguales o la
       cantidad que diga (libre: p. ej. una parte en efectivo y el resto con tarjeta).
       Se abre con open() sobre un pedido de mesa o barra (`order`, el de la cola, que se actualiza en
       vivo). Al tocar un metodo emite pay({ mode, method, units | parts, amountCents }): quien lo usa cobra
       la parte (en efectivo, antes pasa por el modal del cambio) y, si falla, lo dice con `error`.
       "Deshacer última" emite undo. El importe que vale es el que calcula la API; aqui, vista previa. -->
  <dialog ref="dialog" class="split-dialog" aria-labelledby="split-dialog-title" @click.self="close" @close="emit('closed')">
    <div v-if="order" class="split-body">
      <div class="split-head">
        <h2 id="split-dialog-title">Dividir cuenta · {{ order.code }}</h2>
        <button type="button" class="close" aria-label="Cerrar" @click="close">×</button>
      </div>

      <dl class="summary">
        <div><dt>Total</dt><dd>{{ formatPrice(order.totalCents) }}</dd></div>
        <div><dt>Pagado</dt><dd>{{ formatPrice(paid) }}</dd></div>
        <div class="remaining"><dt>Falta</dt><dd>{{ formatPrice(remaining) }}</dd></div>
      </dl>

      <!-- Partes ya cobradas; la ultima se puede deshacer (p. ej. se eligio mal el metodo) -->
      <ol v-if="payments.length" class="parts">
        <li v-for="(p, i) in payments" :key="i">
          <span>Parte {{ i + 1 }} · {{ PAYMENT_LABELS[p.method] }}<span v-if="p.staffName" class="muted"> · {{ p.staffName }}</span></span>
          <strong>{{ formatPrice(p.amountCents) }}</strong>
        </li>
        <li class="parts-actions">
          <button type="button" class="link-button" :disabled="busy" @click="emit('undo')">Deshacer última</button>
          <button v-if="canReprint" type="button" class="link-button" :disabled="busy" @click="emit('reprint', payments.length - 1)">
            Reimprimir ticket
          </button>
        </li>
      </ol>

      <!-- El modo queda fijo en cuanto alguien paga su parte -->
      <SegmentedControl v-if="!payments.length" v-model="mode" :options="MODE_OPTIONS" aria-label="Cómo se divide" />

      <template v-if="mode === 'PRODUCTOS'">
        <p class="muted hint">Marca lo que paga esta persona:</p>
        <ul class="units">
          <li v-for="(line, i) in order.items" :key="i" :class="{ done: left(i) === 0 }">
            <span class="unit-name">
              {{ line.name }}
              <span class="muted">
                {{ formatPrice(line.priceCents) }}{{ line.quantity > 1 ? ` · ${paidUnits[i]} de ${line.quantity} pagados` : paidUnits[i] ? " · pagado" : "" }}
              </span>
            </span>
            <span v-if="left(i) > 0" class="stepper">
              <button type="button" :aria-label="`Uno menos de ${line.name}`" :disabled="!selected[i]" @click="step(i, -1)">−</button>
              <span class="count" aria-live="polite">{{ selected[i] ?? 0 }}</span>
              <button type="button" :aria-label="`Uno más de ${line.name}`" :disabled="(selected[i] ?? 0) >= left(i)" @click="step(i, 1)">+</button>
            </span>
          </li>
        </ul>
      </template>

      <template v-else-if="mode === 'LIBRE'">
        <label class="free">
          <span>Paga</span>
          <input
            ref="freeInput"
            :value="freeText"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Cantidad"
            aria-label="Cantidad que paga esta persona"
            @input="onFreeInput"
          />
        </label>
        <div class="quick" aria-label="Cantidades rápidas">
          <button v-for="q in freeQuick" :key="q.label" type="button" class="quick-btn" :class="{ active: free === q.value }" @click="free = q.value">
            {{ q.label }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="people">
          <span>Entre</span>
          <span class="stepper">
            <button type="button" aria-label="Una persona menos" :disabled="parts <= minParts" @click="parts--">−</button>
            <span class="count">{{ parts }}</span>
            <button type="button" aria-label="Una persona más" :disabled="parts >= MAX_PARTS" @click="parts++">+</button>
          </span>
          <span>personas</span>
        </div>
      </template>

      <p class="part-amount">
        <span>{{ partLabel }}</span>
        <strong>{{ formatPrice(amount) }}</strong>
      </p>
      <p v-if="freeTooMuch" class="error" role="alert">Es más de lo que falta ({{ formatPrice(remaining) }})</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="methods">
        <button v-for="method in PAYMENT_OPTIONS" :key="method" class="button" type="button" :disabled="busy || amount < 1" @click="pay(method)">
          {{ busy ? "Cobrando…" : `${PAYMENT_LABELS[method]}` }}
        </button>
      </div>
      <button class="button secondary" type="button" :disabled="busy" @click="close">Volver</button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { PAYMENT_LABELS, PAYMENT_OPTIONS, type OrderPayment, type PaymentMethod } from "~/composables/useStaffOrders";

type Mode = "PRODUCTOS" | "IGUALES" | "LIBRE";
export interface SplitPart {
  mode: Mode;
  method: PaymentMethod;
  units: { lineIndex: number; quantity: number }[] | null;
  parts: number | null;
  amountCents: number;
}

const props = defineProps<{ order: any | null; busy?: boolean; error?: string | null; canReprint?: boolean }>();
const emit = defineEmits<{ pay: [part: SplitPart]; undo: []; reprint: [index: number]; closed: [] }>();

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "PRODUCTOS", label: "Por productos" },
  { value: "IGUALES", label: "A partes iguales" },
  { value: "LIBRE", label: "Cantidad libre" },
];
const MAX_PARTS = 12; // como MAX_SPLIT_PARTS en la API

const dialog = ref<HTMLDialogElement | null>(null);
const mode = ref<Mode>("PRODUCTOS");
const parts = ref(2);
// Unidades elegidas de cada linea (por posicion en items).
const selected = ref<Record<number, number>>({});
// Cantidad libre, en pesos; null mientras no se ha escrito nada.
const free = ref<number | null>(null);
const freeInput = ref<HTMLInputElement | null>(null);
const freeText = computed(() => (free.value === null ? "" : free.value.toLocaleString("es-CO")));

const payments = computed<OrderPayment[]>(() => props.order?.payments ?? []);
const paid = computed(() => payments.value.reduce((n, p) => n + p.amountCents, 0));
const remaining = computed(() => Math.max((props.order?.totalCents ?? 0) - paid.value, 0));
const paidUnits = computed<number[]>(() => props.order?.paidUnits ?? []);
const minParts = computed(() => Math.max(2, payments.value.length + 1));

// Solo cifras (se aceptan los puntos de miles que se escriban o peguen).
function onFreeInput(event: Event) {
  const el = event.target as HTMLInputElement;
  const digits = el.value.replace(/\D/g, "");
  free.value = digits ? Number(digits) : null;
  el.value = freeText.value;
}
const freeTooMuch = computed(() => mode.value === "LIBRE" && free.value !== null && free.value > remaining.value);
// Atajos: lo que falta y la mitad (redondeada a 100).
const freeQuick = computed(() => {
  const r = remaining.value;
  const half = Math.round(r / 2 / 100) * 100;
  return [{ label: "Lo que falta", value: r }, ...(half > 0 && half < r ? [{ label: `Mitad · ${formatPrice(half)}`, value: half }] : [])];
});

function left(i: number) {
  return (props.order?.items[i]?.quantity ?? 0) - (paidUnits.value[i] ?? 0);
}
function step(i: number, delta: number) {
  const next = Math.min(Math.max((selected.value[i] ?? 0) + delta, 0), left(i));
  selected.value = { ...selected.value, [i]: next };
}

// Al elegir cantidad libre, el teclado numerico sale ya.
watch(mode, async (m) => {
  if (m !== "LIBRE") return;
  await nextTick();
  freeInput.value?.focus();
});

// Si llega otra parte (otra tablet) o se deshace, lo elegido puede no caber: se ajusta.
watch(
  () => props.order?.paidUnits,
  () => {
    const fixed: Record<number, number> = {};
    for (const [i, q] of Object.entries(selected.value)) fixed[+i] = Math.min(q, left(+i));
    selected.value = fixed;
    if (props.order?.split) {
      mode.value = props.order.split.mode;
      if (props.order.split.parts) parts.value = Math.max(props.order.split.parts, minParts.value);
    }
    if (parts.value < minParts.value) parts.value = minParts.value;
  }
);

/** Mismo calculo que la API (orders/split.ts): precio de las unidades, con el descuento y el empaque
 *  en proporcion; la unidad canjeada (la ultima de su linea) vale 0; la ultima parte, lo que falta. */
const amount = computed(() => {
  const order = props.order;
  if (!order) return 0;
  if (mode.value === "LIBRE") return free.value && !freeTooMuch.value ? free.value : 0;
  if (mode.value === "IGUALES") {
    const leftParts = parts.value - payments.value.length;
    if (leftParts < 1) return 0;
    return leftParts === 1 ? remaining.value : Math.round(remaining.value / leftParts);
  }
  const unitPrice = (i: number, u: number) =>
    order.redemption?.lineIndex === i && u === order.items[i].quantity - 1 ? 0 : order.items[i].priceCents;
  let all = 0;
  let chosen = 0;
  let completes = true;
  order.items.forEach((line: any, i: number) => {
    for (let u = 0; u < line.quantity; u++) all += unitPrice(i, u);
    const from = paidUnits.value[i] ?? 0;
    const take = selected.value[i] ?? 0;
    for (let u = from; u < from + take; u++) chosen += unitPrice(i, u);
    if (from + take < line.quantity) completes = false;
  });
  if (!Object.values(selected.value).some(Boolean)) return 0;
  if (completes) return remaining.value;
  return Math.min(all ? Math.round((chosen * order.totalCents) / all) : 0, remaining.value);
});

const partLabel = computed(() => {
  const n = payments.value.length + 1;
  if (mode.value === "IGUALES") return `Parte ${n} de ${parts.value}`;
  return amount.value && amount.value === remaining.value ? `Parte ${n} (la última)` : `Parte ${n}`;
});

function pay(method: PaymentMethod) {
  if (props.busy || amount.value < 1) return;
  const units = Object.entries(selected.value)
    .filter(([, q]) => q > 0)
    .map(([i, q]) => ({ lineIndex: +i, quantity: q }));
  emit("pay", {
    mode: mode.value,
    method,
    units: mode.value === "PRODUCTOS" ? units : null,
    parts: mode.value === "IGUALES" ? parts.value : null,
    amountCents: amount.value,
  });
}
/** Tras cobrar una parte: lo elegido se vacia para la siguiente persona. */
function partDone() {
  selected.value = {};
  free.value = null;
}

function open() {
  selected.value = {};
  free.value = null;
  mode.value = props.order?.split?.mode ?? "PRODUCTOS";
  parts.value = Math.max(props.order?.split?.parts ?? 2, minParts.value);
  if (!dialog.value?.open) dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
}

defineExpose({ open, close, partDone });

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.split-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
}
.split-dialog::backdrop { background: rgba(0, 0, 0, 0.35); }
.split-body { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 18px; }
.split-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.split-head h2 { margin: 0; font-size: 20px; }
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
.summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; }
.summary div { padding: 8px 10px; border-radius: 8px; background: var(--surface-alt); }
.summary dt { font-size: 13px; color: var(--text-muted); }
.summary dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.summary .remaining dd { color: var(--accent); }
.parts { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.parts li { display: flex; justify-content: space-between; gap: 8px; }
.parts-actions { justify-content: flex-start !important; gap: 16px !important; }
.link-button {
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.link-button:disabled { opacity: 0.45; cursor: not-allowed; }
.hint { margin: 0; font-size: 14px; }
.units { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; max-height: 40dvh; overflow-y: auto; }
.units li { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; }
.units li.done { opacity: 0.5; text-decoration: line-through; }
.unit-name { display: flex; flex-direction: column; min-width: 0; }
.unit-name .muted { font-size: 13px; }
.stepper { display: inline-flex; align-items: center; gap: 4px; }
.stepper button {
  width: 44px;
  height: 44px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
}
.stepper button:disabled { opacity: 0.35; cursor: not-allowed; }
.count { min-width: 28px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
.people { display: flex; align-items: center; gap: 10px; }
.free { display: flex; align-items: center; gap: 10px; }
.free input { flex: 1; min-width: 0; min-height: 44px; font-size: 22px; font-variant-numeric: tabular-nums; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-btn {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.quick-btn.active { background: var(--accent); color: var(--bg); }
.part-amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface-alt);
}
.part-amount strong { font-size: 26px; color: var(--accent); font-variant-numeric: tabular-nums; }
.error { margin: 0; color: var(--danger); }
.methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.methods .button, .split-body > .button { min-height: 44px; }
</style>
