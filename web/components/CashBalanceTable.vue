<template>
  <!-- Saldo por metodo: cobrado - pagado, para cuadrar el cajon, el datafono y el banco/Nequi -->
  <table class="balances">
    <caption>Saldo por método</caption>
    <thead>
      <tr>
        <th scope="col">Método</th>
        <th scope="col">Cobrado</th>
        <th scope="col">Pagado</th>
        <th scope="col">Saldo</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="b in visible" :key="b.method">
        <th scope="row">{{ LABELS[b.method] ?? b.method }}</th>
        <td>{{ format(b.inCents) }}</td>
        <td>{{ b.outCents ? `− ${format(b.outCents)}` : format(0) }}</td>
        <td :class="{ negative: b.balanceCents < 0 }">{{ format(b.balanceCents) }}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">Total</th>
        <td>{{ format(totals.in) }}</td>
        <td>{{ totals.out ? `− ${format(totals.out)}` : format(0) }}</td>
        <td :class="{ negative: totals.in - totals.out < 0 }">{{ format(totals.in - totals.out) }}</td>
      </tr>
    </tfoot>
  </table>
</template>

<script setup lang="ts">
export interface MethodBalance {
  method: string;
  inCents: number;
  outCents: number;
  balanceCents: number;
}

const props = defineProps<{ balances: MethodBalance[]; format: (cents: number) => string }>();

// OTRO junta lo cobrado "sin metodo" (pedidos antiguos) y los gastos con metodo "Otro".
const LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo (cajón)",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia/Nequi",
  OTRO: "Otro / sin método",
};

// La fila "Otro" solo si tiene algo: casi siempre esta a cero.
const visible = computed(() => props.balances.filter((b) => b.method !== "OTRO" || b.inCents || b.outCents));
const totals = computed(() => ({
  in: props.balances.reduce((sum, b) => sum + b.inCents, 0),
  out: props.balances.reduce((sum, b) => sum + b.outCents, 0),
}));
</script>

<style scoped>
.balances { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
caption { text-align: left; font-weight: 700; margin-bottom: 6px; color: var(--text); }
th, td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--field-border); }
th:first-child { text-align: left; font-weight: 400; color: var(--text-muted); }
thead th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 600; }
tfoot th, tfoot td { font-weight: 700; color: var(--text); border-bottom: none; }
.negative { color: var(--danger); }
</style>
