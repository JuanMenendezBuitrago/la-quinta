<template>
  <div class="activity">
    <!-- Resumen de la actividad de una persona del personal, mes a mes o entre dos fechas (solo gestion).
         El comentario va dentro del div: fuera, en desarrollo, el componente tendria dos raices y el
         <Transition> que lo envuelve (StaffAdmin) no podria animarlo. -->
    <SegmentedControl
      v-model="mode"
      aria-label="Periodo"
      :options="[{ value: 'mes', label: 'Por meses', icon: CalendarDays }, { value: 'fechas', label: 'Calculadora de horas', icon: Calculator }]"
    />

    <Transition :name="mode === 'fechas' ? 'tab-swap-next' : 'tab-swap-prev'" mode="out-in">
    <div v-if="mode === 'mes'" class="period">
      <button class="nav" type="button" aria-label="Mes anterior" title="Mes anterior" @click="shiftMonth(-1)">
        <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
      <strong class="period-label">{{ monthLabel }}</strong>
      <button class="nav" type="button" aria-label="Mes siguiente" title="Mes siguiente" :disabled="isCurrentMonth" @click="shiftMonth(1)">
        <ChevronRight :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
      <button v-if="!isCurrentMonth" class="link-button" type="button" @click="month = currentMonth">Este mes</button>
    </div>

    <!-- Calculadora: las horas (y lo que se le debe) entre dos fechas cualesquiera, ambas incluidas -->
    <div v-else class="calc">
      <div class="calc-dates">
        <label class="field">
          <span class="muted">Desde</span>
          <input v-model="calcFrom" type="date" :max="calcTo || undefined" required />
        </label>
        <label class="field">
          <span class="muted">Hasta</span>
          <input v-model="calcTo" type="date" :min="calcFrom || undefined" required />
        </label>
      </div>
      <div class="presets">
        <button v-for="p in presets" :key="p.label" type="button" class="chip" :class="{ on: calcFrom === p.from && calcTo === p.to }" @click="calcFrom = p.from; calcTo = p.to">
          {{ p.label }}
        </button>
      </div>
      <p v-if="calcError" class="muted" style="color: var(--danger); margin: 0">{{ calcError }}</p>
      <p v-else class="muted calc-summary">{{ calcLabel }}</p>
    </div>
    </Transition>

    <p v-if="error" class="muted" style="color: var(--danger)">No se pudo cargar la actividad.</p>
    <p v-else-if="!a && loading" class="muted">Cargando actividad…</p>

    <template v-if="a && !(mode === 'fechas' && calcError)">
      <!-- Horas y sueldo: una cuenta compartida no trabaja turnos -->
      <div v-if="!shared" class="tiles" :class="{ stale: loading }">
        <div class="tile">
          <span class="tile-label"><Clock :size="15" :stroke-width="1.8" aria-hidden="true" /> Horas trabajadas</span>
          <strong class="tile-value tabular-nums">{{ formatHours(a.workedMinutes) }}</strong>
          <span class="muted">{{ plural(a.shiftsCount, "turno", "turnos") }}</span>
        </div>
        <!-- Total de horas entre los dias trabajados (un dia con dos turnos cuenta como una jornada) -->
        <div class="tile">
          <span class="tile-label"><Gauge :size="15" :stroke-width="1.8" aria-hidden="true" /> Media por jornada</span>
          <strong class="tile-value tabular-nums">{{ workedDays ? formatHours(Math.round(a.workedMinutes / workedDays)) : "—" }}</strong>
          <span class="muted">{{ plural(workedDays, "día trabajado", "días trabajados") }}</span>
        </div>
        <div class="tile">
          <span class="tile-label"><TimerReset :size="15" :stroke-width="1.8" aria-hidden="true" /> Horas extra</span>
          <strong class="tile-value tabular-nums" :class="{ warn: a.overtimeMinutes > 0 }">{{ formatHours(a.overtimeMinutes) }}</strong>
          <span class="muted">más de {{ formatWeekly(a.weeklyHours) }} por semana</span>
        </div>
        <div class="tile tile--pay">
          <span class="tile-label"><Wallet :size="15" :stroke-width="1.8" aria-hidden="true" /> A pagar</span>
          <template v-if="a.payCents != null">
            <strong class="tile-value tabular-nums">{{ formatPrice(a.payCents) }}</strong>
            <span class="muted tabular-nums">
              {{ formatPrice(a.normalPayCents ?? 0) }} normales<template v-if="a.overtimeMinutes"> + {{ formatPrice(a.overtimePayCents ?? 0) }} extra</template>
            </span>
          </template>
          <template v-else>
            <strong class="tile-value muted">—</strong>
            <span class="muted">Indica su sueldo por hora en «Datos».</span>
          </template>
        </div>
        <div v-if="a.upcomingShiftsCount" class="tile">
          <span class="tile-label"><CalendarClock :size="15" :stroke-width="1.8" aria-hidden="true" /> Por hacer</span>
          <strong class="tile-value tabular-nums">{{ formatHours(a.upcomingMinutes) }}</strong>
          <span class="muted">{{ plural(a.upcomingShiftsCount, "turno programado", "turnos programados") }}</span>
        </div>
      </div>

      <section class="block" :class="{ stale: loading }">
        <h4>En el local</h4>
        <ul class="stats">
          <li><span>Pedidos tomados</span><strong class="tabular-nums">{{ a.ordersTakenCount }}</strong><span class="muted tabular-nums">{{ a.ordersTakenCount ? formatPrice(a.ordersTakenCents) : "" }}</span></li>
          <li><span>Pedidos cobrados</span><strong class="tabular-nums">{{ a.ordersChargedCount }}</strong><span class="muted tabular-nums">{{ a.ordersChargedCount ? formatPrice(a.ordersChargedCents) : "" }}</span></li>
          <li><span>Rebajas hechas</span><strong class="tabular-nums">{{ a.discountsCount }}</strong><span class="muted tabular-nums">{{ a.discountsCount ? `−${formatPrice(a.discountsCents)}` : "" }}</span></li>
          <li><span>Pedidos cancelados</span><strong class="tabular-nums">{{ a.ordersCancelledCount }}</strong><span /></li>
          <li><span>Cierres de caja</span><strong class="tabular-nums">{{ a.cashClosingsCount }}</strong><span /></li>
          <li><span>Gastos apuntados</span><strong class="tabular-nums">{{ a.expensesCount }}</strong><span class="muted tabular-nums">{{ a.expensesCount ? formatPrice(a.expensesCents) : "" }}</span></li>
          <li><span>Ajustes y canjes de sellos</span><strong class="tabular-nums">{{ a.stampMovementsCount }}</strong><span /></li>
        </ul>
        <p v-if="shared" class="muted note">Es una cuenta compartida: lo que se hace con ella queda a nombre de quien la usa, así que aquí sale poco.</p>
      </section>

      <section v-if="!shared" class="block" :class="{ stale: loading }">
        <h4>Turnos hechos</h4>
        <p v-if="!a.shifts.length" class="muted">{{ mode === "mes" ? "Ningún turno hecho este mes." : "Ningún turno hecho en esas fechas." }}</p>
        <ul v-else class="shifts">
          <li v-for="s in a.shifts" :key="s.date + s.start">
            <span class="shift-day">{{ formatDay(s.date) }}</span>
            <span class="tabular-nums">{{ t(s.start) }}–{{ t(s.end) }}</span>
            <span class="tabular-nums shift-hours">
              {{ formatHours(s.minutes) }}
              <span v-if="s.overtimeMinutes" class="extra-badge">+{{ formatHours(s.overtimeMinutes) }} extra</span>
            </span>
            <span v-if="s.note" class="muted shift-note">{{ s.note }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Calculator, CalendarClock, Gauge, CalendarDays, ChevronLeft, ChevronRight, Clock, TimerReset, Wallet } from "lucide-vue-next";
import { gql } from "graphql-tag";
import { useStoreTime } from "~/composables/useStoreTime";
import SegmentedControl from "~/components/SegmentedControl.vue";

const props = defineProps<{ staffId: string; shared: boolean }>();

interface StaffActivity {
  weeklyHours: number;
  shiftsCount: number;
  workedMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  upcomingShiftsCount: number;
  upcomingMinutes: number;
  normalPayCents: number | null;
  overtimePayCents: number | null;
  payCents: number | null;
  shifts: { date: string; start: string; end: string; note?: string | null; minutes: number; overtimeMinutes: number }[];
  ordersTakenCount: number;
  ordersTakenCents: number;
  ordersChargedCount: number;
  ordersChargedCents: number;
  discountsCount: number;
  discountsCents: number;
  ordersCancelledCount: number;
  cashClosingsCount: number;
  expensesCount: number;
  expensesCents: number;
  stampMovementsCount: number;
}

const STAFF_ACTIVITY_QUERY = gql`
  query StaffActivity($staffId: ID!, $from: String!, $to: String!) {
    staffActivity(staffId: $staffId, from: $from, to: $to) {
      weeklyHours
      shiftsCount
      workedMinutes
      normalMinutes
      overtimeMinutes
      upcomingShiftsCount
      upcomingMinutes
      normalPayCents
      overtimePayCents
      payCents
      shifts { date start end note minutes overtimeMinutes }
      ordersTakenCount
      ordersTakenCents
      ordersChargedCount
      ordersChargedCents
      discountsCount
      discountsCents
      ordersCancelledCount
      cashClosingsCount
      expensesCount
      expensesCents
      stampMovementsCount
    }
  }
`;

// Mes en el calendario de la tienda ("YYYY-MM")
const { toStoreInput } = useStoreTime();
const currentMonth = toStoreInput(new Date()).slice(0, 7);
const month = ref(currentMonth);
const isCurrentMonth = computed(() => month.value >= currentMonth);

function shiftMonth(delta: number) {
  const [y, m] = month.value.split("-").map(Number);
  month.value = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

// ---------- Calculadora de horas: dos fechas cualesquiera ----------
const mode = ref<"mes" | "fechas">("mes");
const today = toStoreInput(new Date()).slice(0, 10);
const MAX_RANGE_DAYS = 366; // el mismo limite que la API

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const thisMonday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));

// Atajos habituales para pagar: semanas y quincenas (1-15 y 16-fin de mes)
const presets = computed(() => {
  const ym = today.slice(0, 7);
  const { to: monthEnd } = monthRange(ym);
  const prevYm = addDays(`${ym}-01`, -1).slice(0, 7);
  const firstHalf = today.slice(8) <= "15";
  const currentHalf = firstHalf ? { from: `${ym}-01`, to: `${ym}-15` } : { from: `${ym}-16`, to: monthEnd };
  const previousHalf = firstHalf ? { from: `${prevYm}-16`, to: monthRange(prevYm).to } : { from: `${ym}-01`, to: `${ym}-15` };
  return [
    { label: "Esta semana", from: thisMonday, to: addDays(thisMonday, 6) },
    { label: "Semana pasada", from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) },
    { label: "Esta quincena", ...currentHalf },
    { label: "Quincena pasada", ...previousHalf },
  ];
});
const calcFrom = ref(presets.value[2].from);
const calcTo = ref(presets.value[2].to);

const calcError = computed(() => {
  if (!calcFrom.value || !calcTo.value) return "Elige las dos fechas.";
  if (calcTo.value < calcFrom.value) return "La fecha «Hasta» debe ser igual o posterior a «Desde».";
  if (daysBetween(calcFrom.value, calcTo.value) > MAX_RANGE_DAYS) return "Como mucho, un año entre las dos fechas.";
  return "";
});
const calcLabel = computed(() => {
  const days = daysBetween(calcFrom.value, calcTo.value) + 1;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  return `Del ${fmt(calcFrom.value)} al ${fmt(calcTo.value)}, ambos incluidos (${days} ${days === 1 ? "día" : "días"}).`;
});

const range = computed(() => (mode.value === "mes" ? monthRange(month.value) : { from: calcFrom.value, to: calcTo.value }));
const monthLabel = computed(() => {
  const [y, m] = month.value.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-ES", { timeZone: "UTC", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const { result, loading, error, refetch } = useQuery<{ staffActivity: StaffActivity }>(
  STAFF_ACTIVITY_QUERY,
  () => ({ staffId: props.staffId, ...range.value }),
  () => ({ fetchPolicy: "network-only", enabled: mode.value === "mes" || !calcError.value })
);
// Se queda con el ultimo resultado mientras carga el siguiente mes (atenuado): sin saltos.
const last = ref<StaffActivity | null>(null);
watch(result, (r) => { if (r?.staffActivity) last.value = r.staffActivity; }, { immediate: true });
watch(() => props.staffId, () => { last.value = null; });
const a = computed(() => last.value);

defineExpose({ refetch });

function formatHours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h && m) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}
function formatWeekly(hours: number) {
  return `${String(hours).replace(".", ",")} h`;
}
function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric" });
}
const t = (hhmm: string) => hhmm.replace(/^0(\d)/, "$1").replace(/:00$/, "");
const workedDays = computed(() => new Set(a.value?.shifts.map((s) => s.date) ?? []).size);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<style scoped>
.activity { display: flex; flex-direction: column; gap: 16px; }
.calc { display: flex; flex-direction: column; gap: 10px; }
.calc-dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; max-width: 420px; }
.calc .field { display: flex; flex-direction: column; gap: 4px; }
.calc input[type="date"] { width: 100%; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  min-height: 34px;
  padding: 5px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}
.chip.on { border-color: transparent; background: var(--accent-soft); color: var(--on-accent-soft); }
.chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.calc-summary { margin: 0; font-size: 13.5px; }

.period { display: flex; align-items: center; gap: 6px; }
.period-label { min-width: 150px; text-align: center; font-size: 16px; }
.nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.nav:disabled { opacity: 0.35; cursor: not-allowed; }
.nav:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.link-button { border: none; background: none; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 6px 8px; }
.stale { opacity: 0.55; transition: opacity 0.15s; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-alt, var(--surface));
  min-width: 0;
}
.tile--pay { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.tile-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
.tile-value { font-size: 22px; line-height: 1.2; }
.tile-value.warn { color: var(--danger); }
.tile .muted { font-size: 12.5px; }

.block h4 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.stats, .shifts { list-style: none; margin: 0; padding: 0; }
.stats li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(90px, auto);
  gap: 12px;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.stats li:last-child { border-bottom: none; }
.stats li > :last-child { text-align: right; font-size: 13.5px; }
.note { margin: 8px 0 0; font-size: 13px; }

.shifts li {
  display: grid;
  grid-template-columns: 70px 90px minmax(0, 1fr);
  gap: 4px 12px;
  align-items: baseline;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.shifts li:last-child { border-bottom: none; }
.shift-day { text-transform: capitalize; font-weight: 600; }
.shift-hours { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.shift-note { grid-column: 2 / -1; font-size: 13px; }
.extra-badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--danger) 16%, transparent);
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}
</style>
