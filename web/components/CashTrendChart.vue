<template>
  <!-- Ultimos 30 dias: resumen arriba y, debajo, una columna por dia (ingresos hacia arriba,
       gastos hacia abajo desde el cero). Pasar el dedo o el raton por un dia muestra sus cifras. -->
  <section class="card trend" aria-labelledby="trend-title">
    <h2 id="trend-title" class="trend-title">Últimos {{ DAYS }} días</h2>

    <dl class="kpis">
      <div class="kpi">
        <dt>Ingresos</dt>
        <dd>{{ formatPrice(totals.income) }}</dd>
      </div>
      <div class="kpi">
        <dt>Gastos</dt>
        <dd>{{ totals.expenses ? `− ${formatPrice(totals.expenses)}` : formatPrice(0) }}</dd>
      </div>
      <div class="kpi">
        <dt>Neto</dt>
        <dd :class="{ negative: totals.income - totals.expenses < 0 }">{{ formatPrice(totals.income - totals.expenses) }}</dd>
      </div>
      <div class="kpi">
        <dt>Pedidos</dt>
        <dd>
          {{ totals.orders }}
          <span v-if="totals.orders" class="kpi-sub">ticket medio {{ formatPrice(Math.round(totals.income / totals.orders)) }}</span>
        </dd>
      </div>
    </dl>

    <ul class="legend" aria-hidden="true">
      <li><span class="swatch swatch--income" /> Ingresos</li>
      <li><span class="swatch swatch--expenses" /> Gastos</li>
    </ul>

    <div ref="plotEl" class="plot" :class="{ loading: loading && days.length }" @pointerleave="hover = null">
      <p v-if="!days.length" class="muted">{{ loading ? "Cargando…" : "Sin datos." }}</p>
      <svg
        v-else-if="width"
        :width="width"
        :height="HEIGHT"
        role="img"
        :aria-label="`Ingresos y gastos por día de los últimos ${DAYS} días. Ingresos ${formatPrice(totals.income)}, gastos ${formatPrice(totals.expenses)}. El detalle está en la tabla.`"
      >
        <!-- Rejilla y escala: lineas finas, el cero un poco mas marcado -->
        <g class="grid">
          <g v-for="tick in ticks" :key="tick">
            <line :x1="PAD_LEFT" :x2="width - PAD_RIGHT" :y1="y(tick)" :y2="y(tick)" :class="{ zero: tick === 0 }" />
            <text :x="PAD_LEFT - 8" :y="y(tick)" dy="0.32em" text-anchor="end">{{ compact(tick) }}</text>
          </g>
        </g>
        <!-- Dia bajo el puntero: una banda tenue -->
        <rect
          v-if="hover !== null"
          class="hover-band"
          :x="slotX(hover)"
          :y="PAD_TOP"
          :width="slotW"
          :height="HEIGHT - PAD_TOP - PAD_BOTTOM"
        />
        <g v-for="(d, i) in days" :key="d.date">
          <path v-if="d.incomeCents" class="bar bar--income" :d="barPath(i, d.incomeCents)" />
          <path v-if="d.expensesCents" class="bar bar--expenses" :d="barPath(i, -d.expensesCents)" />
        </g>
        <!-- El mejor dia, con su importe encima (una sola etiqueta: el resto, en el tooltip y la tabla) -->
        <text
          v-if="best !== null"
          class="best-label"
          :x="slotX(best) + slotW / 2"
          :y="y(days[best].incomeCents) - 6"
          text-anchor="middle"
        >
          {{ compact(days[best].incomeCents) }}
        </text>
        <!-- Fechas: una por semana, y hoy -->
        <g class="x-axis">
          <text
            v-for="i in xLabels"
            :key="i"
            :x="slotX(i) + slotW / 2"
            :y="HEIGHT - 6"
            :text-anchor="i === days.length - 1 ? 'end' : 'middle'"
          >
            {{ i === days.length - 1 ? "Hoy" : shortDate(days[i].date) }}
          </text>
        </g>
        <!-- Zonas de toque: el dia entero, no solo la columna -->
        <rect
          v-for="(d, i) in days"
          :key="`hit-${d.date}`"
          class="hit"
          :x="slotX(i)"
          :y="0"
          :width="slotW"
          :height="HEIGHT"
          @pointerenter="hover = i"
          @pointerdown="hover = i"
        />
      </svg>

      <div
        v-if="hover !== null && days[hover]"
        class="tooltip"
        :style="{ left: `${tooltipLeft}px` }"
        role="status"
      >
        <span class="tt-date">{{ longDate(days[hover].date) }}</span>
        <span class="tt-row"><i class="key key--income" /><strong>{{ formatPrice(days[hover].incomeCents) }}</strong> ingresos</span>
        <span class="tt-row"><i class="key key--expenses" /><strong>{{ days[hover].expensesCents ? `− ${formatPrice(days[hover].expensesCents)}` : formatPrice(0) }}</strong> gastos</span>
        <span class="tt-row tt-muted">
          Neto {{ formatPrice(days[hover].incomeCents - days[hover].expensesCents) }} ·
          {{ days[hover].ordersCount }} {{ days[hover].ordersCount === 1 ? "pedido" : "pedidos" }}
        </span>
      </div>
    </div>

    <!-- Las mismas cifras en tabla (y para quien no puede usar la grafica) -->
    <details class="table-view">
      <summary>Ver tabla</summary>
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Ingresos</th>
            <th scope="col">Gastos</th>
            <th scope="col">Neto</th>
            <th scope="col">Pedidos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in [...days].reverse()" :key="d.date">
            <th scope="row">{{ longDate(d.date) }}</th>
            <td>{{ formatPrice(d.incomeCents) }}</td>
            <td>{{ d.expensesCents ? `− ${formatPrice(d.expensesCents)}` : formatPrice(0) }}</td>
            <td :class="{ negative: d.incomeCents - d.expensesCents < 0 }">{{ formatPrice(d.incomeCents - d.expensesCents) }}</td>
            <td>{{ d.ordersCount }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";

interface CashDay {
  date: string;
  incomeCents: number;
  expensesCents: number;
  ordersCount: number;
}

const DAYS = 30;
const HEIGHT = 200;
const PAD_LEFT = 56;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

const STATS = gql`
  query CashDailyStats($days: Int) {
    cashDailyStats(days: $days) { date incomeCents expensesCents ordersCount }
  }
`;
const { result, loading } = useQuery<{ cashDailyStats: CashDay[] }>(STATS, { days: DAYS }, { fetchPolicy: "cache-and-network" });
const days = computed(() => result.value?.cashDailyStats ?? []);

const totals = computed(() =>
  days.value.reduce(
    (t, d) => ({ income: t.income + d.incomeCents, expenses: t.expenses + d.expensesCents, orders: t.orders + d.ordersCount }),
    { income: 0, expenses: 0, orders: 0 },
  ),
);

// ---------- Geometria (al ancho real del contenedor, para que el texto no se escale) ----------
const plotEl = ref<HTMLElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.floor(entry.contentRect.width)));
  if (plotEl.value) observer.observe(plotEl.value);
});
onBeforeUnmount(() => observer?.disconnect());

const slotW = computed(() => (width.value - PAD_LEFT - PAD_RIGHT) / Math.max(1, days.value.length));
const barW = computed(() => Math.max(2, Math.min(24, slotW.value * 0.62)));
const slotX = (i: number) => PAD_LEFT + i * slotW.value;

// Escala: de "redondo" en "redondo", con el cero dentro (gastos hacia abajo).
function niceStep(range: number) {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
const scale = computed(() => {
  const maxUp = Math.max(0, ...days.value.map((d) => d.incomeCents));
  const maxDown = Math.max(0, ...days.value.map((d) => d.expensesCents));
  const step = niceStep(maxUp + maxDown || 1);
  const top = Math.ceil(maxUp / step) * step || step;
  const bottom = -Math.ceil(maxDown / step) * step;
  return { top, bottom, step };
});
const ticks = computed(() => {
  const { top, bottom, step } = scale.value;
  const out: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) out.push(Math.round(v));
  return out;
});
function y(value: number) {
  const { top, bottom } = scale.value;
  const h = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + ((top - value) / (top - bottom)) * h;
}

/** Columna con el extremo de datos redondeado (4 px) y la base recta, sobre el cero. */
function barPath(i: number, value: number) {
  const x = slotX(i) + (slotW.value - barW.value) / 2;
  const w = barW.value;
  const y0 = y(0);
  const y1 = y(value);
  const len = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, len);
  if (value > 0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

const best = computed(() => {
  let idx: number | null = null;
  days.value.forEach((d, i) => {
    if (d.incomeCents > 0 && (idx === null || d.incomeCents > days.value[idx].incomeCents)) idx = i;
  });
  return idx;
});

// Una fecha por semana contando desde hoy hacia atras, para que "Hoy" siempre tenga su etiqueta.
const xLabels = computed(() => {
  const n = days.value.length;
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= 7) out.push(i);
  return out.reverse();
});

const hover = ref<number | null>(null);
const tooltipLeft = computed(() => {
  if (hover.value === null) return 0;
  const center = slotX(hover.value) + slotW.value / 2;
  const half = 85;
  return Math.min(Math.max(center, half), width.value - half);
});

// ---------- Formatos ----------
function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
/** Escala del eje: "$ 0", "$ 200 mil", "$ 1,5 M". */
function compact(value: number) {
  const sign = value < 0 ? "−" : "";
  const v = Math.abs(value);
  if (v >= 1_000_000) return `${sign}$ ${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000) return `${sign}$ ${(v / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  return `${sign}$ ${v}`;
}
const dateOf = (key: string) => new Date(`${key}T12:00:00`);
function shortDate(key: string) {
  return dateOf(key).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(" de ", " ").replace(".", "");
}
function longDate(key: string) {
  const text = dateOf(key).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }).replace(" de ", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
</script>

<style scoped>
/* Colores de las series (validados para la superficie oscura: ver el skill de dataviz) */
.trend {
  --income: #2ba099;
  --expenses: #c8803f;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.trend-title { font-size: 17px; margin: 0; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px 16px; margin: 0; }
.kpi { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kpi dt { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.kpi dd { margin: 0; font-family: var(--font-futura-text); font-size: 19px; font-weight: 900; line-height: 1.2; white-space: nowrap; }
.kpi dd.negative { color: var(--danger); }
.kpi-sub { display: block; white-space: normal; font-family: var(--font-sans); font-size: 12px; font-weight: 400; color: var(--text-muted); }

.legend { display: flex; gap: 16px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--text-muted); }
.legend li { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; }
.swatch--income { background: var(--income); }
.swatch--expenses { background: var(--expenses); }

.plot { position: relative; min-height: 60px; touch-action: pan-y; }
.plot.loading svg { opacity: 0.6; }
svg { display: block; overflow: visible; }
.grid line { stroke: var(--border-strong); stroke-width: 1; shape-rendering: crispEdges; }
.grid line.zero { stroke: var(--text-muted); opacity: 0.5; }
.grid text, .x-axis text { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.bar--income { fill: var(--income); }
.bar--expenses { fill: var(--expenses); }
.best-label { fill: var(--text); font-size: 11px; font-weight: 700; }
.hover-band { fill: var(--text); opacity: 0.06; }
.hit { fill: transparent; cursor: crosshair; }

.tooltip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-alt);
  font-size: 13px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}
.tt-date { font-size: 12px; color: var(--text-muted); }
.tt-row { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
.tt-row strong { color: var(--text); font-variant-numeric: tabular-nums; }
.tt-muted { font-size: 12px; }
.key { display: inline-block; width: 12px; height: 2px; border-radius: 1px; }
.key--income { background: var(--income); }
.key--expenses { background: var(--expenses); }

.table-view summary { cursor: pointer; font-size: 13px; color: var(--accent); }
.table-view table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.table-scroll { overflow-x: auto; }
.table-view th, .table-view td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
.table-view th[scope="row"], .table-view thead th:first-child { text-align: left; font-weight: 400; }
.table-view thead th { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.table-view td.negative { color: var(--danger); }
</style>
