<template>
  <!-- Cobro en efectivo: con cuanto paga el cliente y cuanto hay que devolverle. Se abre con open();
       "Cobrar" emite confirm y quien lo usa registra el pago (y cierra con close()). -->
  <dialog ref="dialog" class="cash-dialog" aria-labelledby="cash-dialog-title" @click.self="close">
    <form class="cash-dialog-body" @submit.prevent="confirm">
      <div class="cash-dialog-head">
        <h2 id="cash-dialog-title">Pago en efectivo</h2>
        <button type="button" class="close" aria-label="Cerrar" @click="close">×</button>
      </div>

      <p class="total"><span class="muted">Total</span><strong>{{ formatPrice(totalCents) }}</strong></p>

      <label class="field">
        <span class="muted">Paga con</span>
        <input
          ref="input"
          :value="paidText"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Cantidad que entrega"
          @input="onInput"
        />
      </label>
      <!-- Atajos: el importe exacto y los billetes (o redondeos) que mas se ven por encima del total -->
      <div class="quick" aria-label="Cantidades rápidas">
        <button v-for="amount in quickAmounts" :key="amount" type="button" class="quick-btn" :class="{ active: paid === amount }" @click="paid = amount">
          {{ amount === totalCents ? "Exacto" : formatPrice(amount) }}
        </button>
      </div>

      <p v-if="paid !== null" class="change" :class="{ short: paid < totalCents }" aria-live="polite">
        <span>{{ paid < totalCents ? "Falta" : "Devolver" }}</span>
        <strong>{{ formatPrice(Math.abs(paid - totalCents)) }}</strong>
      </p>

      <div class="actions">
        <button class="button" type="submit" :disabled="busy || (paid !== null && paid < totalCents)">
          {{ busy ? "Cobrando…" : "Cobrar" }}
        </button>
        <button class="button secondary" type="button" :disabled="busy" @click="close">Volver</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
const props = defineProps<{ totalCents: number; busy?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
// Lo que entrega el cliente, en pesos; null mientras no se ha escrito nada.
const paid = ref<number | null>(null);
const paidText = computed(() => (paid.value === null ? "" : paid.value.toLocaleString("es-CO")));

// Solo cifras (se aceptan los puntos de miles que se escriban o peguen).
function onInput(event: Event) {
  const el = event.target as HTMLInputElement;
  const digits = el.value.replace(/\D/g, "");
  paid.value = digits ? Number(digits) : null;
  el.value = paidText.value;
}

const BILLS = [2000, 5000, 10000, 20000, 50000, 100000];
const quickAmounts = computed(() => {
  const total = props.totalCents;
  const rounded = BILLS.map((bill) => Math.ceil(total / bill) * bill).filter((amount) => amount > total);
  return [total, ...new Set(rounded)].slice(0, 5);
});

async function open() {
  paid.value = null;
  dialog.value?.showModal();
  await nextTick();
  input.value?.focus();
}
function close() {
  dialog.value?.close();
}
function confirm() {
  if (props.busy || (paid.value !== null && paid.value < props.totalCents)) return;
  emit("confirm");
}

defineExpose({ open, close });

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
.cash-dialog {
  width: min(400px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
}
.cash-dialog::backdrop { background: rgba(0, 0, 0, 0.35); }
.cash-dialog-body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
.cash-dialog-head { display: flex; align-items: center; justify-content: space-between; }
.cash-dialog-head h2 { margin: 0; }
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
.total, .change { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0; }
.total strong { font-size: 20px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field input { font-size: 22px; font-variant-numeric: tabular-nums; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; }
.quick-btn {
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
.quick-btn.active { background: var(--accent); color: var(--bg); }
/* Lo que hay que devolver, bien grande: es lo que se mira mientras se cuentan los billetes */
.change { padding: 12px 14px; border-radius: 10px; background: var(--surface-alt); }
.change strong { font-size: 28px; color: var(--accent); font-variant-numeric: tabular-nums; }
.change.short strong { color: var(--danger); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions .button { min-height: 44px; }
</style>
