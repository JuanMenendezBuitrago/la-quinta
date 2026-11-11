<template>
  <!-- Horarios del personal: cuadrante de la semana (personas x dias) o un dia en barras sobre el
       horario de apertura. Todo el personal lo ve; solo gestion crea, cambia y borra turnos. -->
  <section class="shifts wide-head">
    <ClientOnly>
      <Teleport to="#staff-hero-actions">
        <div v-if="canEdit" class="hero-actions">
          <button class="button secondary" type="button" :disabled="copying" @click="copyPreviousWeek">
            <Copy :size="16" :stroke-width="1.8" aria-hidden="true" />
            {{ copying ? "Copiando…" : "Copiar semana anterior" }}
          </button>
          <button class="button" type="button" @click="openCreate()">+ Turno</button>
        </div>
      </Teleport>
    </ClientOnly>

    <!-- Barra de la semana: navegar, volver a hoy y cambiar de vista -->
    <div class="toolbar card">
      <div class="week-nav">
        <button class="icon-btn" type="button" aria-label="Semana anterior" @click="shiftWeek(-1)">
          <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <div class="week-label">
          <strong>{{ weekLabel }}</strong>
          <span class="muted tabular-nums">{{ weekSummary }}</span>
        </div>
        <button class="icon-btn" type="button" aria-label="Semana siguiente" @click="shiftWeek(1)">
          <ChevronRight :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <button v-if="monday !== todayMonday" class="link-button" type="button" @click="goToday">Hoy</button>
      </div>
      <div class="view-toggle" role="tablist" aria-label="Vista">
        <button type="button" role="tab" :aria-selected="view === 'semana'" :class="{ on: view === 'semana' }" @click="view = 'semana'">
          <CalendarDays :size="16" :stroke-width="1.8" aria-hidden="true" /> Semana
        </button>
        <button type="button" role="tab" :aria-selected="view === 'dia'" :class="{ on: view === 'dia' }" @click="view = 'dia'">
          <GanttChart :size="16" :stroke-width="1.8" aria-hidden="true" /> Día
        </button>
      </div>
    </div>

    <p v-if="notice" class="notice" role="status">
      {{ notice }}
      <button class="link-button" type="button" @click="notice = ''">Cerrar</button>
    </p>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>

    <!-- Lo propio, arriba, para quien no edita: que no tenga que buscarse en el cuadrante -->
    <p v-if="!canEdit && myWeek" class="mine card">
      <UserAvatar :avatar="me?.avatar" :name="me?.name" :size="28" />
      <span>
        <strong>Tus turnos esta semana:</strong>
        {{ myWeek.count ? `${myWeek.count} · ${formatHours(myWeek.minutes)}` : "ninguno" }}
      </span>
    </p>

    <!-- ===================== Vista semana ===================== -->
    <div v-if="view === 'semana'" class="board-scroll">
      <div class="board" role="table" :aria-label="`Turnos de la ${weekLabel}`">
        <div class="row head" role="row">
          <div class="cell person-cell" role="columnheader"><span class="muted">Persona</span></div>
          <button
            v-for="day in days"
            :key="day.date"
            class="cell day-head"
            :class="{ today: day.date === today, closed: !day.hours }"
            type="button"
            role="columnheader"
            :title="`Ver el ${day.longLabel}`"
            @click="openDay(day.date)"
          >
            <span class="dow">{{ day.short }}</span>
            <span class="dom tabular-nums">{{ day.dayNum }}</span>
            <span class="hours muted">{{ day.hours ? `${t(day.hours.open)}–${t(day.hours.close)}` : "Cerrado" }}</span>
          </button>
        </div>

        <div v-if="!people.length && !loading" class="row">
          <div class="cell empty-row">
            <EmptyState :icon="Users" title="No hay personal activo" compact />
          </div>
        </div>

        <div v-for="person in people" :key="person.id" class="row" :class="{ me: person.id === me?.id }" role="row">
          <div class="cell person-cell" role="rowheader">
            <UserAvatar :avatar="person.avatar" :name="person.name" :size="32" />
            <span class="person-text">
              <strong>{{ person.name }}</strong>
              <span class="muted tabular-nums"><span v-if="person.id === me?.id" class="you">Tú</span>{{ formatHours(minutesOf(person.id)) }}</span>
            </span>
          </div>
          <div
            v-for="day in days"
            :key="day.date"
            class="cell day-cell"
            :class="{ today: day.date === today, closed: !day.hours }"
            role="cell"
          >
            <button
              v-for="shift in shiftsOf(person.id, day.date)"
              :key="shift.id"
              class="chip"
              :class="{ outside: isOutside(shift, day.hours) }"
              type="button"
              :disabled="!canEdit"
              :title="chipTitle(shift, day.hours)"
              @click="openEdit(shift)"
            >
              <span class="chip-time tabular-nums">{{ t(shift.start) }}–{{ t(shift.end) }}</span>
              <span v-if="shift.note" class="chip-note">{{ shift.note }}</span>
            </button>
            <button
              v-if="canEdit"
              class="add-slot"
              type="button"
              :aria-label="`Añadir turno a ${person.name} el ${day.longLabel}`"
              @click="openCreate(person.id, day.date)"
            >
              <Plus :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Cobertura: cuanta gente hay en cada media hora del horario de apertura -->
        <div class="row coverage-row" role="row">
          <div class="cell person-cell" role="rowheader">
            <span class="person-text">
              <strong>Cobertura</strong>
              <span class="muted">personas en tienda</span>
            </span>
          </div>
          <div v-for="day in days" :key="day.date" class="cell coverage-cell" :class="{ today: day.date === today }" role="cell">
            <template v-if="day.hours">
              <div class="cov-wrap">
                <div class="cov-bar" :aria-label="coverageOf(day).summary">
                  <span
                    v-for="(slot, i) in coverageOf(day).slots"
                    :key="i"
                    class="cov-slot"
                    :style="{ flexGrow: toMin(slot.to) - toMin(slot.from) }"
                    :class="`lvl-${Math.min(slot.count, 3)}`"
                    :title="`${t(slot.from)}–${t(slot.to)}: ${slot.count} ${slot.count === 1 ? 'persona' : 'personas'}`"
                  />
                </div>
                <span
                  v-if="day.date === today && nowInside(day.hours.open, day.hours.close)"
                  class="now-mark"
                  :style="{ left: `${((nowMin! - toMin(day.hours.open)) / (toMin(day.hours.close) - toMin(day.hours.open))) * 100}%` }"
                  :title="`Ahora: ${nowLabel}`"
                />
              </div>
              <span class="cov-text" :class="{ gap: coverageOf(day).gaps.length }">{{ coverageOf(day).summary }}</span>
            </template>
            <span v-else class="muted">—</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== Vista dia ===================== -->
    <div v-else class="day-view">
      <div class="day-tabs" role="tablist" aria-label="Día de la semana">
        <button
          v-for="day in days"
          :key="day.date"
          type="button"
          role="tab"
          class="day-tab"
          :class="{ on: day.date === selectedDate, today: day.date === today, closed: !day.hours }"
          :aria-selected="day.date === selectedDate"
          @click="selectedDate = day.date"
        >
          <span class="dow">{{ day.short }}</span>
          <span class="dom tabular-nums">{{ day.dayNum }}</span>
          <span class="dot" :class="{ warn: day.hours && coverageOf(day).gaps.length }" aria-hidden="true" />
        </button>
      </div>

      <div class="card day-card">
        <div class="day-card-head">
          <div>
            <h2>{{ selectedDay.longLabel }}</h2>
            <p class="muted">
              {{ selectedDay.hours ? `Abierto de ${t(selectedDay.hours.open)} a ${t(selectedDay.hours.close)}` : "La tienda está cerrada" }}
              <template v-if="selectedDay.hours"> · <span :class="{ 'gap-text': coverageOf(selectedDay).gaps.length }">{{ coverageOf(selectedDay).summary }}</span></template>
            </p>
          </div>
          <button v-if="canEdit" class="button secondary" type="button" @click="openCreate(undefined, selectedDate)">+ Turno este día</button>
        </div>

        <div class="gantt" :style="{ '--hours': ganttRange.hours }">
          <!-- Escala de horas -->
          <div class="g-row g-scale" aria-hidden="true">
            <span class="g-name" />
            <span class="g-track">
              <span v-for="h in ganttRange.ticks" :key="h" class="tick" :style="{ left: pct(h * 60) }">{{ h }}</span>
              <span v-if="showNowLine" class="now-label tabular-nums" :style="{ left: pct(nowMin!) }">{{ nowLabel }}</span>
            </span>
          </div>

          <div v-for="row in dayRows" :key="row.person.id" class="g-row" :class="{ me: row.person.id === me?.id }">
            <span class="g-name">
              <UserAvatar :avatar="row.person.avatar" :name="row.person.name" :size="28" />
              <span>{{ row.person.name }}</span>
            </span>
            <span class="g-track">
              <!-- Horario de apertura, de fondo -->
              <span
                v-if="selectedDay.hours"
                class="open-band"
                :style="band(selectedDay.hours.open, selectedDay.hours.close)"
                aria-hidden="true"
              />
              <span v-if="showNowLine" class="now-line" :style="{ left: pct(nowMin!) }" aria-hidden="true" />
              <!-- La barra abre el dialogo; sus extremos se arrastran para cambiar la hora (de 15 en 15 min) -->
              <span
                v-for="shift in row.shifts.map(live)"
                :key="shift.id"
                class="g-bar-wrap"
                :class="{ dragging: resize?.id === shift.id, pending: pendingId === shift.id }"
                :style="band(shift.start, shift.end)"
              >
                <button
                  class="g-bar"
                  :class="outsideClass(shift, selectedDay.hours)"
                  type="button"
                  :disabled="!canEdit"
                  :title="chipTitle(shift, selectedDay.hours)"
                  @click="openEdit(shift)"
                >
                  <span class="tabular-nums">{{ t(shift.start) }}–{{ t(shift.end) }}</span>
                  <span v-if="resize?.id === shift.id" class="g-note tabular-nums">· {{ formatHours(duration(shift)) }}</span>
                  <span v-else-if="shift.note" class="g-note">· {{ shift.note }}</span>
                </button>
                <template v-if="canEdit">
                  <span
                    v-for="edge in (['start', 'end'] as const)"
                    :key="edge"
                    class="g-handle"
                    :class="edge"
                    role="slider"
                    tabindex="0"
                    :aria-label="`${edge === 'start' ? 'Entrada' : 'Salida'} de ${shift.staffName}`"
                    :aria-valuemin="0"
                    :aria-valuemax="24 * 60"
                    :aria-valuenow="toMin(shift[edge])"
                    :aria-valuetext="t(shift[edge])"
                    @pointerdown="startResize($event, shift, edge)"
                    @pointermove="moveResize"
                    @pointerup="endResize"
                    @pointercancel="cancelResize"
                    @keydown="keyResize($event, shift, edge)"
                    @blur="commitKeyResize"
                  />
                </template>
              </span>
            </span>
          </div>

          <!-- Cobertura del dia, en la misma escala -->
          <div v-if="selectedDay.hours" class="g-row g-coverage">
            <span class="g-name muted">Cobertura</span>
            <span class="g-track">
              <span v-if="showNowLine" class="now-line" :style="{ left: pct(nowMin!) }" aria-hidden="true" />
              <span
                v-for="(slot, i) in coverageOf(selectedDay).slots"
                :key="i"
                class="cov-slot abs"
                :class="`lvl-${Math.min(slot.count, 3)}`"
                :style="band(slot.from, slot.to)"
                :title="`${t(slot.from)}–${t(slot.to)}: ${slot.count}`"
              />
            </span>
          </div>
        </div>

        <EmptyState v-if="!dayRows.length" :icon="CalendarX2" title="Nadie tiene turno este día" compact>
          <template v-if="canEdit">Añade uno con «+ Turno este día».</template>
        </EmptyState>
        <p v-if="freePeople.length" class="muted free">
          Libres: {{ freePeople.map((p) => p.name).join(", ") }}
        </p>
      </div>
    </div>

    <div class="legend muted" aria-hidden="true">
      <span><i class="cov-slot lvl-0" /> Sin nadie</span>
      <span><i class="cov-slot lvl-1" /> 1 persona</span>
      <span><i class="cov-slot lvl-2" /> 2</span>
      <span><i class="cov-slot lvl-3" /> 3 o más</span>
      <span><i class="chip-swatch outside" /> Fuera del horario de apertura</span>
    </div>

    <!-- ===================== Resumen por persona (semana que se ve) ===================== -->
    <section class="card summary" aria-labelledby="summary-title">
      <div class="summary-head">
        <h2 id="summary-title">Resumen por persona</h2>
        <span class="muted">{{ weekLabel }} · comparado con la semana anterior</span>
      </div>
      <div class="sum-table" role="table" aria-labelledby="summary-title">
        <div class="sum-row sum-header" role="row">
          <span role="columnheader">Persona</span>
          <span role="columnheader">Días</span>
          <span role="columnheader" class="num">Turnos</span>
          <span role="columnheader">Horas</span>
          <span role="columnheader" class="num">Vs. anterior</span>
          <span role="columnheader">Franja</span>
          <span role="columnheader" class="num">Fuera de horario</span>
        </div>
        <div
          v-for="row in summary"
          :key="row.person.id"
          class="sum-row"
          :class="{ me: row.person.id === me?.id, idle: !row.count }"
          role="row"
        >
          <span class="sum-person" role="rowheader">
            <UserAvatar :avatar="row.person.avatar" :name="row.person.name" :size="28" />
            <strong>{{ row.person.name }}</strong>
            <span v-if="row.person.id === me?.id" class="you">Tú</span>
          </span>
          <span class="sum-days" role="cell" :aria-label="`Trabaja ${row.days} de 7 días`">
            <span
              v-for="(m, i) in row.perDay"
              :key="i"
              class="sum-day"
              :class="{ on: m > 0, closed: !days[i].hours }"
              :title="`${days[i].longLabel}: ${m ? formatHours(m) : 'libre'}`"
            >{{ DOW_INITIAL[i] }}</span>
          </span>
          <span class="num tabular-nums" role="cell"><span class="sum-label">Turnos</span>{{ row.count || "—" }}</span>
          <span class="sum-hours" role="cell">
            <span class="sum-label">Horas</span>
            <strong class="tabular-nums">{{ row.count ? formatHours(row.minutes) : "Sin turnos" }}</strong>
            <span class="sum-bar" aria-hidden="true"><span :style="{ width: `${(row.minutes / summaryMax) * 100}%` }" /></span>
          </span>
          <span class="num tabular-nums delta" role="cell" :class="{ up: row.delta > 0, down: row.delta < 0 }">
            <span class="sum-label">Cambio</span>{{ formatDelta(row.delta) }}
          </span>
          <span class="tabular-nums muted" role="cell">
            <span class="sum-label">Franja</span>{{ row.range ?? "—" }}
          </span>
          <span class="num tabular-nums" role="cell" :class="{ warn: row.outside }">
            <span class="sum-label">Fuera hor.</span>{{ row.outside || "—" }}
          </span>
        </div>
        <div class="sum-row sum-total" role="row">
          <span role="rowheader"><strong>Total</strong></span>
          <span role="cell" class="muted">{{ summaryTotals.people }} con turnos</span>
          <span class="num tabular-nums" role="cell"><span class="sum-label">Turnos</span>{{ summaryTotals.count }}</span>
          <span role="cell"><span class="sum-label">Horas</span><strong class="tabular-nums">{{ formatHours(summaryTotals.minutes) }}</strong></span>
          <span class="num tabular-nums delta" role="cell" :class="{ up: summaryTotals.delta > 0, down: summaryTotals.delta < 0 }">
            <span class="sum-label">Cambio</span>{{ formatDelta(summaryTotals.delta) }}
          </span>
          <span role="cell" />
          <span class="num tabular-nums" role="cell" :class="{ warn: summaryTotals.outside }">
            <span class="sum-label">Fuera hor.</span>{{ summaryTotals.outside || "—" }}
          </span>
        </div>
      </div>
    </section>

    <!-- ===================== Dialogo de turno ===================== -->
    <dialog ref="dialog" class="shift-dialog" aria-labelledby="shift-dialog-title" @click.self="closeDialog" @close="onDialogClosed">
      <form class="shift-dialog-body" @submit.prevent="save">
        <div class="dialog-head">
          <h2 id="shift-dialog-title">{{ form.id ? "Editar turno" : "Nuevo turno" }}</h2>
          <button type="button" class="close" aria-label="Cerrar" @click="closeDialog">×</button>
        </div>

        <label class="field">
          <span class="muted">Persona</span>
          <select v-model="form.staffId" required>
            <option value="" disabled>Elige a quién</option>
            <option v-for="p in activePeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>

        <!-- Al crear: uno o varios dias de la semana que se esta viendo. Al editar: una fecha. -->
        <div v-if="!form.id" class="field">
          <span class="muted">Días ({{ weekLabel }})</span>
          <div class="day-picks">
            <button
              v-for="day in days"
              :key="day.date"
              type="button"
              class="day-pick"
              :class="{ on: form.dates.includes(day.date), closed: !day.hours }"
              :aria-pressed="form.dates.includes(day.date)"
              :title="day.hours ? day.longLabel : `${day.longLabel} (cerrado)`"
              @click="toggleDate(day.date)"
            >
              <span>{{ day.short }}</span>
              <span class="tabular-nums">{{ day.dayNum }}</span>
            </button>
          </div>
          <div class="quick">
            <button type="button" class="quick-btn" @click="pickDates('laborables')">Lun–Vie</button>
            <button type="button" class="quick-btn" @click="pickDates('abiertos')">Días abiertos</button>
            <button type="button" class="quick-btn" @click="form.dates = []">Ninguno</button>
          </div>
        </div>
        <label v-else class="field">
          <span class="muted">Fecha</span>
          <input v-model="form.date" type="date" required />
        </label>

        <div class="times">
          <label class="field">
            <span class="muted">Entrada</span>
            <input v-model="form.start" type="time" step="900" required />
          </label>
          <label class="field">
            <span class="muted">Salida</span>
            <input v-model="form.end" type="time" step="900" required />
          </label>
          <p class="duration tabular-nums" :class="{ bad: formMinutes <= 0 }" aria-live="polite">
            {{ formMinutes > 0 ? formatHours(formMinutes) : "—" }}
          </p>
        </div>

        <!-- Atajos segun el horario de apertura del (primer) dia elegido -->
        <div v-if="presets.length" class="quick" aria-label="Horarios rápidos">
          <button
            v-for="p in presets"
            :key="p.label"
            type="button"
            class="quick-btn"
            :class="{ active: form.start === p.start && form.end === p.end }"
            @click="applyPreset(p)"
          >
            {{ p.label }} <span class="tabular-nums">{{ t(p.start) }}–{{ t(p.end) }}</span>
          </button>
        </div>

        <label class="field">
          <span class="muted">Nota (opcional)</span>
          <input v-model="form.note" type="text" maxlength="80" placeholder="Apertura, inventario, formación…" />
        </label>

        <p v-if="formError" class="error" role="alert">{{ formError }}</p>

        <div class="actions">
          <button class="button" type="submit" :disabled="saving || !formValid">
            {{ saving ? "Guardando…" : form.id ? "Guardar" : form.dates.length > 1 ? `Crear ${form.dates.length} turnos` : "Crear turno" }}
          </button>
          <button class="button secondary" type="button" :disabled="saving" @click="closeDialog">Cancelar</button>
        </div>

        <div v-if="form.id" class="delete-zone">
          <button v-if="!confirmingDelete" class="button secondary delete" type="button" :disabled="saving" @click="confirmingDelete = true">
            <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
            Borrar turno
          </button>
          <template v-else>
            <span class="muted">¿Borrar este turno?</span>
            <div class="actions">
              <button class="button secondary delete" type="button" :disabled="saving" @click="remove">Sí, borrar</button>
              <button class="button secondary" type="button" :disabled="saving" @click="confirmingDelete = false">No</button>
            </div>
          </template>
          <p v-if="editingShift" class="muted small">Última modificación: {{ editingShift.updatedByName }}</p>
        </div>
      </form>
    </dialog>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import {
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Copy,
  GanttChart,
  Plus,
  Trash2,
  Users,
} from "lucide-vue-next";
import EmptyState from "~/components/EmptyState.vue";
import UserAvatar from "~/components/UserAvatar.vue";
import { useStaffAuth } from "~/composables/useAuth";
import { useStoreTime } from "~/composables/useStoreTime";
import { SITE_SETTINGS_QUERY, type OpeningHours, type SiteSettings } from "~/composables/useSiteSettings";

interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  staffAvatar: string | null;
  date: string;
  start: string;
  end: string;
  note: string | null;
  updatedByName: string;
}
interface Person {
  id: string;
  name: string;
  avatar: string | null;
}

const SHIFT_FIELDS = `id staffId staffName staffAvatar date start end note updatedByName`;
const SHIFTS_QUERY = gql`
  query Shifts($from: String!, $to: String!) {
    shifts(from: $from, to: $to) { ${SHIFT_FIELDS} }
  }
`;
const PEOPLE_QUERY = gql`
  query ShiftPeople {
    actingStaffOptions { id name avatar }
  }
`;
const CREATE_SHIFTS = gql`
  mutation CreateShifts($input: ShiftInput!, $dates: [String!]!) {
    createShifts(input: $input, dates: $dates) { id }
  }
`;
const UPDATE_SHIFT = gql`
  mutation UpdateShift($id: ID!, $input: ShiftInput!) {
    updateShift(id: $id, input: $input) { id }
  }
`;
const DELETE_SHIFT = gql`
  mutation DeleteShift($id: ID!) {
    deleteShift(id: $id)
  }
`;
const COPY_WEEK = gql`
  mutation CopyShiftsWeek($fromMonday: String!, $toMonday: String!) {
    copyShiftsWeek(fromMonday: $fromMonday, toMonday: $toMonday)
  }
`;

const { staff } = useStaffAuth();
const canEdit = computed(() => staff.value?.role === "gestion");
// En una cuenta compartida, "yo" es quien la esta usando.
const me = computed(() => (staff.value?.actingAs ?? staff.value) as Person | null | undefined);

// ---------- Fechas (calendario de la tienda, "YYYY-MM-DD") ----------
const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const { toStoreInput } = useStoreTime();

function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}
const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));
function fmtDate(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", ...opts });
}

const today = toStoreInput(new Date()).slice(0, 10);
const todayMonday = mondayOf(today);
const monday = ref(todayMonday);
const sunday = computed(() => addDays(monday.value, 6));
const selectedDate = ref(today);

// ---------- Datos ----------
const { result: settingsResult } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const openingHours = computed<OpeningHours[]>(() => settingsResult.value?.siteSettings.openingHours ?? []);

const { result: peopleResult } = useQuery<{ actingStaffOptions: Person[] }>(PEOPLE_QUERY, null, { fetchPolicy: "cache-and-network" });
const activePeople = computed(() => peopleResult.value?.actingStaffOptions ?? []);

const {
  result: shiftsResult,
  loading,
  error,
  refetch,
} = useQuery<{ shifts: Shift[] }>(SHIFTS_QUERY, () => ({ from: addDays(monday.value, -7), to: sunday.value }), {
  fetchPolicy: "cache-and-network",
});
// Se piden dos semanas (la anterior, para comparar en el resumen); casi todo usa solo la que se ve.
const allShifts = computed(() => shiftsResult.value?.shifts ?? []);
const shifts = computed(() => allShifts.value.filter((s) => s.date >= monday.value));
const prevShifts = computed(() => allShifts.value.filter((s) => s.date < monday.value));
const loadError = computed(() => (error.value ? "No se pudieron cargar los turnos." : ""));

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday.value, i);
    return {
      date,
      short: DOW_SHORT[i],
      dayNum: Number(date.slice(8)),
      longLabel: fmtDate(date, { weekday: "long", day: "numeric", month: "long" }),
      hours: openingHours.value.find((h) => h.weekday === i + 1) ?? null,
    };
  })
);
const selectedDay = computed(() => days.value.find((d) => d.date === selectedDate.value) ?? days.value[0]);

// Filas: el personal activo y, ademas, quien ya no lo esta pero tiene turnos esa semana. Yo, primero.
const people = computed<Person[]>(() => {
  const list = [...activePeople.value];
  for (const s of shifts.value) {
    if (!list.some((p) => p.id === s.staffId)) list.push({ id: s.staffId, name: s.staffName, avatar: s.staffAvatar });
  }
  const myId = me.value?.id;
  return list.sort((a, b) => Number(b.id === myId) - Number(a.id === myId) || a.name.localeCompare(b.name, "es"));
});

const shiftsOf = (staffId: string, date: string) => shifts.value.filter((s) => s.staffId === staffId && s.date === date);

// ---------- Horas ----------
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const t = (hhmm: string) => hhmm.replace(/^0(\d)/, "$1").replace(/:00$/, "");
const duration = (s: { start: string; end: string }) => toMin(s.end) - toMin(s.start);
function formatHours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h && m) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}
const minutesOf = (staffId: string) => shifts.value.filter((s) => s.staffId === staffId).reduce((sum, s) => sum + duration(s), 0);

// ---------- Resumen por persona ----------
const DOW_INITIAL = ["L", "M", "X", "J", "V", "S", "D"];
function formatDelta(min: number) {
  if (!min) return "=";
  return `${min > 0 ? "+" : "−"}${formatHours(Math.abs(min))}`;
}
const summary = computed(() =>
  people.value.map((person) => {
    const mine = shifts.value.filter((s) => s.staffId === person.id);
    const minutes = mine.reduce((sum, s) => sum + duration(s), 0);
    const prev = prevShifts.value.filter((s) => s.staffId === person.id).reduce((sum, s) => sum + duration(s), 0);
    const perDay = days.value.map((d) => mine.filter((s) => s.date === d.date).reduce((sum, s) => sum + duration(s), 0));
    const starts = mine.map((s) => s.start).sort();
    const ends = mine.map((s) => s.end).sort();
    return {
      person,
      count: mine.length,
      minutes,
      delta: minutes - prev,
      perDay,
      days: perDay.filter((m) => m > 0).length,
      // Primera entrada y ultima salida de la semana
      range: mine.length ? `${t(starts[0])}–${t(ends[ends.length - 1])}` : null,
      outside: mine.filter((s) => isOutside(s, days.value.find((d) => d.date === s.date)?.hours ?? null)).length,
    };
  })
);
const summaryMax = computed(() => Math.max(1, ...summary.value.map((r) => r.minutes)));
const summaryTotals = computed(() => {
  const minutes = summary.value.reduce((sum, r) => sum + r.minutes, 0);
  const prev = prevShifts.value.reduce((sum, s) => sum + duration(s), 0);
  return {
    people: summary.value.filter((r) => r.count).length,
    count: shifts.value.length,
    minutes,
    delta: minutes - prev,
    outside: summary.value.reduce((sum, r) => sum + r.outside, 0),
  };
});

const weekLabel = computed(() => {
  const a = monday.value;
  const b = sunday.value;
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return sameMonth
    ? `Semana del ${Number(a.slice(8))} al ${fmtDate(b, { day: "numeric", month: "long" })}`
    : `Semana del ${fmtDate(a, { day: "numeric", month: "short" })} al ${fmtDate(b, { day: "numeric", month: "short" })}`;
});
const weekSummary = computed(() => {
  const total = shifts.value.reduce((sum, s) => sum + duration(s), 0);
  const n = shifts.value.length;
  return n ? `${n} ${n === 1 ? "turno" : "turnos"} · ${formatHours(total)}` : "Sin turnos";
});
const myWeek = computed(() => {
  const id = me.value?.id;
  if (!id) return null;
  const mine = shifts.value.filter((s) => s.staffId === id);
  return { count: mine.length, minutes: mine.reduce((sum, s) => sum + duration(s), 0) };
});

function isOutside(s: Shift, hours: OpeningHours | null) {
  return !hours || s.start < hours.open || s.end > hours.close;
}
/** En la barra del día, de qué lado se sale del horario: el degradado va hacia ese lado. */
function outsideClass(s: Shift, hours: OpeningHours | null) {
  if (!isOutside(s, hours)) return {};
  if (!hours) return { outside: true };
  return { outside: true, early: s.start < hours.open, late: s.end > hours.close };
}
function chipTitle(s: Shift, hours: OpeningHours | null) {
  const base = `${s.staffName}: ${t(s.start)}–${t(s.end)} (${formatHours(duration(s))})${s.note ? ` · ${s.note}` : ""}`;
  if (!hours) return `${base} · la tienda está cerrada ese día`;
  return isOutside(s, hours) ? `${base} · fuera del horario de apertura` : base;
}

// ---------- Cobertura (tramos de 30 min dentro del horario de apertura) ----------
const SLOT = 30;
function coverageOf(day: { date: string; hours: OpeningHours | null }) {
  const slots: { from: string; to: string; count: number }[] = [];
  const gaps: { from: string; to: string }[] = [];
  if (!day.hours) return { slots, gaps, summary: "" };
  const dayShifts = shifts.value.filter((s) => s.date === day.date);
  const open = toMin(day.hours.open);
  const close = toMin(day.hours.close);
  for (let m = open; m < close; m += SLOT) {
    const end = Math.min(m + SLOT, close);
    // Cuenta quien esta todo el tramo (entrar a las 7:15 deja las 7:00–7:30 sin cubrir del todo).
    const count = dayShifts.filter((s) => toMin(s.start) <= m && toMin(s.end) >= end).length;
    // Tramos seguidos con la misma cantidad se juntan.
    const last = slots[slots.length - 1];
    if (last && last.count === count) last.to = fromMin(end);
    else slots.push({ from: fromMin(m), to: fromMin(end), count });
  }
  for (const s of slots) if (s.count === 0) gaps.push({ from: s.from, to: s.to });
  const min = slots.length ? Math.min(...slots.map((s) => s.count)) : 0;
  let summary: string;
  if (!dayShifts.length) summary = "Sin nadie";
  else if (gaps.length) summary = `Sin nadie ${gaps.map((g) => `${t(g.from)}–${t(g.to)}`).join(", ")}`;
  else summary = min === 1 ? "Cubierto (mín. 1)" : `Cubierto (mín. ${min})`;
  return { slots, gaps, summary };
}

// ---------- Vista dia (barras) ----------
const dayShifts = computed(() => shifts.value.filter((s) => s.date === selectedDate.value));
const dayRows = computed(() =>
  people.value
    .map((person) => ({ person, shifts: dayShifts.value.filter((s) => s.staffId === person.id) }))
    .filter((r) => r.shifts.length)
    .sort((a, b) => a.shifts[0].start.localeCompare(b.shifts[0].start))
);
const freePeople = computed(() => activePeople.value.filter((p) => !dayShifts.value.some((s) => s.staffId === p.id)));
const ganttRange = computed(() => {
  const h = selectedDay.value.hours;
  const starts = [...dayShifts.value.map((s) => toMin(s.start)), ...(h ? [toMin(h.open)] : [7 * 60])];
  const ends = [...dayShifts.value.map((s) => toMin(s.end)), ...(h ? [toMin(h.close)] : [19 * 60])];
  const from = Math.floor(Math.min(...starts) / 60);
  const to = Math.ceil(Math.max(...ends) / 60);
  const ticks = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return { from: from * 60, to: to * 60, hours: to - from, ticks };
});
const pct = (min: number) => `${((min - ganttRange.value.from) / (ganttRange.value.to - ganttRange.value.from)) * 100}%`;
const band = (start: string, end: string) => ({
  left: pct(toMin(start)),
  width: `${((toMin(end) - toMin(start)) / (ganttRange.value.to - ganttRange.value.from)) * 100}%`,
});

// ---------- Hora actual (linea "ahora") ----------
// Solo en el cliente, para que el SSR no pinte una hora distinta. Se actualiza cada minuto,
// justo al cambiar el minuto del reloj (no a los 60 s de abrir la pagina).
const nowMin = ref<number | null>(null);
const nowLabel = computed(() => (nowMin.value === null ? "" : fromMin(nowMin.value).replace(/^0(\d)/, "$1")));
let nowTimer: ReturnType<typeof setTimeout> | undefined;
function tickNow() {
  const v = toStoreInput(new Date());
  nowMin.value = v.slice(0, 10) === today ? toMin(v.slice(11, 16)) : null;
  nowTimer = setTimeout(tickNow, 60_000 - (Date.now() % 60_000) + 50);
}
onMounted(tickNow);
onBeforeUnmount(() => clearTimeout(nowTimer));
const nowInside = (from: string, to: string) => nowMin.value !== null && nowMin.value >= toMin(from) && nowMin.value <= toMin(to);
const showNowLine = computed(
  () => selectedDate.value === today && nowMin.value !== null && nowMin.value >= ganttRange.value.from && nowMin.value <= ganttRange.value.to
);

// ---------- Cambiar la duracion arrastrando los extremos de la barra ----------
const STEP = 15;
const LAST_MIN = 23 * 60 + 45; // la API no admite 24:00
type Edge = "start" | "end";
// Horas provisionales mientras se arrastra (o se cambia con el teclado) y hasta que llega la recarga.
const draft = ref<{ id: string; start: number; end: number } | null>(null);
const resize = ref<{ id: string; edge: Edge; pointerId: number; x: number; minPerPx: number; from: number } | null>(null);
const pendingId = ref<string | null>(null);
let keyTimer: ReturnType<typeof setTimeout> | undefined;

const live = (s: Shift): Shift =>
  draft.value?.id === s.id ? { ...s, start: fromMin(draft.value.start), end: fromMin(draft.value.end) } : s;

// Hasta donde puede llegar un extremo: lo que se ve de la escala, sin pisar otro turno de la misma persona
// y dejando al menos 15 minutos de turno.
function edgeLimits(s: Shift, edge: Edge, start: number, end: number) {
  const others = dayShifts.value.filter((o) => o.staffId === s.staffId && o.id !== s.id);
  if (edge === "start") {
    const prevEnd = Math.max(ganttRange.value.from, ...others.map((o) => toMin(o.end)).filter((m) => m <= toMin(s.start)));
    return { min: Math.ceil(prevEnd / STEP) * STEP, max: end - STEP };
  }
  const nextStart = Math.min(ganttRange.value.to, LAST_MIN, ...others.map((o) => toMin(o.start)).filter((m) => m >= toMin(s.end)));
  return { min: start + STEP, max: Math.floor(nextStart / STEP) * STEP };
}
function setEdge(s: Shift, edge: Edge, value: number) {
  const cur = draft.value?.id === s.id ? draft.value : { id: s.id, start: toMin(s.start), end: toMin(s.end) };
  const { min, max } = edgeLimits(s, edge, cur.start, cur.end);
  const snapped = Math.min(max, Math.max(min, Math.round(value / STEP) * STEP));
  draft.value = { ...cur, [edge]: snapped };
}

function startResize(e: PointerEvent, s: Shift, edge: Edge) {
  if (!canEdit.value || pendingId.value || e.button > 0) return;
  const track = (e.currentTarget as HTMLElement).closest(".g-track") as HTMLElement | null;
  if (!track) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const original = shifts.value.find((x) => x.id === s.id) ?? s;
  draft.value = { id: s.id, start: toMin(original.start), end: toMin(original.end) };
  resize.value = {
    id: s.id,
    edge,
    pointerId: e.pointerId,
    x: e.clientX,
    minPerPx: (ganttRange.value.to - ganttRange.value.from) / track.getBoundingClientRect().width,
    from: toMin(original[edge]),
  };
}
function moveResize(e: PointerEvent) {
  const r = resize.value;
  if (!r || e.pointerId !== r.pointerId) return;
  const s = shifts.value.find((x) => x.id === r.id);
  if (s) setEdge(s, r.edge, r.from + (e.clientX - r.x) * r.minPerPx);
}
function endResize(e: PointerEvent) {
  const r = resize.value;
  if (!r || e.pointerId !== r.pointerId) return;
  resize.value = null;
  void commitDraft();
}
function cancelResize() {
  resize.value = null;
  draft.value = null;
}

// Con el teclado: flechas de 15 en 15; se guarda al parar un momento, con Enter o al salir del tirador.
function keyResize(e: KeyboardEvent, s: Shift, edge: Edge) {
  if (pendingId.value) return;
  const step = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP }[e.key];
  if (e.key === "Enter") {
    e.preventDefault();
    commitKeyResize();
    return;
  }
  if (e.key === "Escape" && draft.value) {
    clearTimeout(keyTimer);
    draft.value = null;
    return;
  }
  if (!step) return;
  e.preventDefault();
  const cur = draft.value?.id === s.id ? draft.value[edge] : toMin(s[edge]);
  setEdge(shifts.value.find((x) => x.id === s.id) ?? s, edge, cur + step);
  clearTimeout(keyTimer);
  keyTimer = setTimeout(commitDraft, 800);
}
function commitKeyResize() {
  clearTimeout(keyTimer);
  if (!resize.value) void commitDraft();
}

async function commitDraft() {
  const d = draft.value;
  if (!d || pendingId.value) return;
  const s = shifts.value.find((x) => x.id === d.id);
  if (!s || (toMin(s.start) === d.start && toMin(s.end) === d.end)) {
    draft.value = null;
    return;
  }
  pendingId.value = d.id;
  notice.value = "";
  try {
    await useMutation(UPDATE_SHIFT).mutate({
      id: s.id,
      input: { staffId: s.staffId, date: s.date, start: fromMin(d.start), end: fromMin(d.end), note: s.note },
    });
    await refetch();
  } catch (err: any) {
    notice.value = err?.message ?? "No se pudo cambiar el turno";
  } finally {
    // Se quita al final para que la barra no salte a las horas viejas mientras llega la recarga.
    if (draft.value?.id === d.id) draft.value = null;
    pendingId.value = null;
  }
}
onBeforeUnmount(() => clearTimeout(keyTimer));

// ---------- Vista y navegacion ----------
const view = ref<"semana" | "dia">("semana");
onMounted(() => {
  // En pantallas estrechas el cuadrante no cabe: se empieza por el dia.
  if (window.matchMedia("(max-width: 760px)").matches) view.value = "dia";
});
function shiftWeek(n: number) {
  monday.value = addDays(monday.value, n * 7);
  selectedDate.value = addDays(monday.value, weekdayOf(selectedDate.value) - 1);
}
function goToday() {
  monday.value = todayMonday;
  selectedDate.value = today;
}
function openDay(date: string) {
  selectedDate.value = date;
  view.value = "dia";
}

// ---------- Copiar semana ----------
const notice = ref("");
const copying = ref(false);
async function copyPreviousWeek() {
  copying.value = true;
  notice.value = "";
  try {
    const { mutate } = useMutation<{ copyShiftsWeek: number }>(COPY_WEEK);
    const res = await mutate({ fromMonday: addDays(monday.value, -7), toMonday: monday.value });
    const n = res?.data?.copyShiftsWeek ?? 0;
    notice.value = n
      ? `Se ${n === 1 ? "copió 1 turno" : `copiaron ${n} turnos`} de la semana anterior.`
      : "No había nada que copiar (o ya estaba todo).";
    await refetch();
  } catch (err: any) {
    notice.value = err?.message ?? "No se pudo copiar la semana";
  } finally {
    copying.value = false;
  }
}

// ---------- Dialogo ----------
const dialog = ref<HTMLDialogElement | null>(null);
const form = reactive({ id: "", staffId: "", date: "", dates: [] as string[], start: "", end: "", note: "" });
const formError = ref("");
const saving = ref(false);
const confirmingDelete = ref(false);
const editingShift = computed(() => shifts.value.find((s) => s.id === form.id) ?? null);

const formMinutes = computed(() => (form.start && form.end ? toMin(form.end) - toMin(form.start) : 0));
const formValid = computed(() => !!form.staffId && formMinutes.value > 0 && (form.id ? !!form.date : form.dates.length > 0));

const presets = computed(() => {
  const date = form.id ? form.date : [...form.dates].sort()[0];
  const h = date ? openingHours.value.find((x) => x.weekday === weekdayOf(date)) : null;
  if (!h) return [];
  const open = toMin(h.open);
  const close = toMin(h.close);
  const span = close - open;
  if (span <= 8 * 60) return [{ label: "Todo el día", start: h.open, end: h.close }];
  // Dos turnos que se solapan en medio (relevo), redondeados a la media hora.
  const half = Math.round((open + span / 2) / 30) * 30;
  return [
    { label: "Mañana", start: h.open, end: fromMin(Math.min(half + 60, close)) },
    { label: "Tarde", start: fromMin(Math.max(half - 60, open)), end: h.close },
    { label: "Todo el día", start: h.open, end: h.close },
  ];
});
function applyPreset(p: { start: string; end: string }) {
  form.start = p.start;
  form.end = p.end;
}
function toggleDate(date: string) {
  form.dates = form.dates.includes(date) ? form.dates.filter((d) => d !== date) : [...form.dates, date];
}
function pickDates(kind: "laborables" | "abiertos") {
  form.dates = days.value.filter((d, i) => (kind === "laborables" ? i < 5 : !!d.hours)).map((d) => d.date);
}

function resetForm() {
  Object.assign(form, { id: "", staffId: "", date: "", dates: [], start: "", end: "", note: "" });
  formError.value = "";
  confirmingDelete.value = false;
}
function openCreate(staffId?: string, date?: string) {
  if (!canEdit.value) return;
  resetForm();
  form.staffId = staffId ?? "";
  form.dates = [date ?? (selectedDate.value >= monday.value && selectedDate.value <= sunday.value ? selectedDate.value : monday.value)];
  // Por defecto, el primer atajo (la mañana o el dia entero).
  if (presets.value[0]) applyPreset(presets.value[0]);
  dialog.value?.showModal();
}
function openEdit(s: Shift) {
  if (!canEdit.value) return;
  resetForm();
  Object.assign(form, { id: s.id, staffId: s.staffId, date: s.date, start: s.start, end: s.end, note: s.note ?? "" });
  dialog.value?.showModal();
}
function closeDialog() {
  dialog.value?.close();
}
function onDialogClosed() {
  saving.value = false;
  confirmingDelete.value = false;
}

async function save() {
  if (!formValid.value) return;
  saving.value = true;
  formError.value = "";
  const input = { staffId: form.staffId, date: form.id ? form.date : form.dates[0], start: form.start, end: form.end, note: form.note.trim() || null };
  try {
    if (form.id) {
      await useMutation(UPDATE_SHIFT).mutate({ id: form.id, input });
    } else {
      await useMutation(CREATE_SHIFTS).mutate({ input, dates: form.dates });
    }
    await refetch();
    closeDialog();
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar el turno";
  } finally {
    saving.value = false;
  }
}
async function remove() {
  saving.value = true;
  formError.value = "";
  try {
    await useMutation(DELETE_SHIFT).mutate({ id: form.id });
    await refetch();
    closeDialog();
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo borrar el turno";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.shifts { display: flex; flex-direction: column; gap: 14px; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* --- Barra de la semana --- */
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
.week-nav { display: flex; align-items: center; gap: 8px; }
.week-label { display: flex; flex-direction: column; min-width: 0; }
.week-label strong { font-size: 16px; }
.week-label .muted { font-size: 13px; }
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.icon-btn:hover { border-color: var(--accent); color: var(--accent); }
.link-button { border: none; background: none; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 6px 8px; }
.view-toggle { display: inline-flex; padding: 3px; border: 1px solid var(--border-strong); border-radius: 10px; }
.view-toggle button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.view-toggle button.on { background: var(--accent-soft); color: var(--on-accent-soft); }

.notice, .error { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0; }
.notice { padding: 10px 14px; border-radius: 10px; background: var(--accent-soft); color: var(--on-accent-soft); }
.error { color: var(--danger); }
.mine { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 14px; }

/* --- Cuadrante semanal --- */
.board-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.board { display: grid; min-width: 860px; }
.row { display: grid; grid-template-columns: 190px repeat(7, minmax(92px, 1fr)); border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: none; }
.row.me { background: color-mix(in srgb, var(--accent-soft) 35%, transparent); }
.cell { padding: 8px; border-left: 1px solid var(--border); min-width: 0; }
.cell:first-child { border-left: none; }
.empty-row { grid-column: 1 / -1; }
.person-cell { display: flex; align-items: center; gap: 10px; position: sticky; left: 0; z-index: 1; background: var(--surface); }
.row.me .person-cell { background: color-mix(in srgb, var(--accent-soft) 35%, var(--surface)); }
.person-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.person-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14.5px; }
.person-text .muted { font-size: 12.5px; }
.you {
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  vertical-align: 1px;
}

.head { position: sticky; top: 0; z-index: 2; background: var(--surface-alt); }
.head .person-cell { background: var(--surface-alt); }
.day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  border-top: none;
  border-right: none;
  border-bottom: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.day-head:hover .dom { color: var(--accent); }
.dow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
.dom { font-family: var(--font-serif); font-size: 22px; line-height: 1.1; }
.day-head .hours { font-size: 11.5px; }
.day-head.today .dom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bg);
}
.day-cell.today, .coverage-cell.today { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.closed:not(.day-head) {
  background: repeating-linear-gradient(135deg, transparent 0 8px, rgba(243, 236, 225, 0.035) 8px 16px);
}

.day-cell { display: flex; flex-direction: column; gap: 6px; min-height: 64px; }
.chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--on-accent-soft);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.chip:disabled { cursor: default; opacity: 1; }
.chip:not(:disabled):hover { background: color-mix(in srgb, var(--accent-soft) 70%, var(--accent)); }
.chip.outside { border-left-color: var(--color5); }
.chip-time { font-size: 13.5px; font-weight: 600; white-space: nowrap; }
.chip-note { font-size: 11.5px; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.add-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 28px;
  border: 1.5px dashed transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}
.day-cell:hover .add-slot, .add-slot:focus-visible { opacity: 1; border-color: var(--field-border); }
.add-slot:hover { color: var(--accent); border-color: var(--accent) !important; }
/* En pantallas tactiles no hay hover: el + se ve siempre, discreto */
@media (hover: none) { .add-slot { opacity: 0.6; border-color: var(--border-strong); } }

/* --- Cobertura --- */
.coverage-row { background: var(--surface-alt); }
.coverage-row .person-cell { background: var(--surface-alt); }
.coverage-cell { display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.cov-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; gap: 1px; }
.cov-bar .cov-slot { flex: 1; }
.cov-slot { display: inline-block; height: 10px; background: var(--border-strong); }
.cov-slot.lvl-0 { background: repeating-linear-gradient(135deg, var(--danger) 0 3px, transparent 3px 6px); }
.cov-slot.lvl-1 { background: color-mix(in srgb, var(--accent) 40%, transparent); }
.cov-slot.lvl-2 { background: color-mix(in srgb, var(--accent) 70%, transparent); }
.cov-slot.lvl-3 { background: var(--accent); }
.cov-text { font-size: 11.5px; line-height: 1.3; color: var(--text-muted); }
.cov-text.gap, .gap-text { color: var(--danger); font-weight: 600; }

/* --- Vista dia --- */
.day-view { display: flex; flex-direction: column; gap: 12px; }
.day-tabs { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.day-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.day-tab .dom { font-size: 19px; }
.day-tab.today .dom { color: var(--accent); }
.day-tab.on { border-color: var(--accent); background: var(--accent-soft); }
.day-tab.on .dow { color: var(--on-accent-soft); }
.day-tab.closed { opacity: 0.6; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: transparent; }
.dot.warn { background: var(--danger); }
.day-card { display: flex; flex-direction: column; gap: 14px; }
.day-card-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
.day-card-head h2 { margin: 0 0 2px; }
.day-card-head h2::first-letter { text-transform: uppercase; }
.day-card-head p { margin: 0; }

.gantt { display: flex; flex-direction: column; gap: 6px; }
.g-row { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 10px; }
.g-row.me .g-name span { color: var(--accent); font-weight: 600; }
.g-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; }
.g-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-track {
  position: relative;
  height: 38px;
  border-radius: 8px;
  background: repeating-linear-gradient(
    90deg,
    var(--border) 0 1px,
    transparent 1px calc(100% / var(--hours))
  );
}
.g-scale .g-track { height: 18px; background: none; }
.tick { position: absolute; top: 0; transform: translateX(-50%); font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.tick:first-child { transform: none; }
.tick:last-child { transform: translateX(-100%); }
.open-band { position: absolute; top: 0; bottom: 0; border-radius: 8px; background: rgba(243, 236, 225, 0.04); outline: 1px dashed var(--border-strong); }
.g-bar-wrap { position: absolute; top: 4px; bottom: 4px; }
.g-bar-wrap.pending { opacity: 0.7; }
.g-bar-wrap.dragging .g-bar { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
/* Zona de agarre generosa (tablet), centrada en el borde; se ve una muesca discreta */
.g-handle {
  position: absolute;
  top: -4px;
  bottom: -4px;
  z-index: 1;
  width: 22px;
  cursor: ew-resize;
  touch-action: none;
}
.g-handle.start { left: -11px; }
.g-handle.end { right: -11px; }
.g-handle::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--bg);
  opacity: 0.55;
  transform: translate(-50%, -50%);
  transition: opacity 0.15s ease;
}
.g-handle.start::after { left: calc(50% + 5px); }
.g-handle.end::after { left: calc(50% - 5px); }
.g-bar-wrap:hover .g-handle::after, .g-bar-wrap.dragging .g-handle::after, .g-handle:focus-visible::after { opacity: 1; }
.g-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 6px; }
.g-bar {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  overflow: hidden;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: var(--bg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.g-bar:disabled { cursor: default; opacity: 1; }
.g-bar.outside { background: linear-gradient(90deg, var(--accent), var(--color5)); }
/* Empieza antes de abrir: amarillo -> azul; acaba despues de cerrar: azul -> amarillo; ambos: los dos lados. */
.g-bar.outside.early { background: linear-gradient(90deg, var(--color5), var(--accent)); }
.g-bar.outside.early.late { background: linear-gradient(90deg, var(--color5), var(--accent), var(--color5)); }
.g-note { font-weight: 400; overflow: hidden; text-overflow: ellipsis; }
.g-coverage .g-track { height: 12px; background: none; }
/* Hora actual: linea vertical que cruza todas las filas del dia de hoy, con la hora en la escala */
.now-line {
  position: absolute;
  top: -4px;
  bottom: -4px;
  z-index: 2;
  width: 2px;
  margin-left: -1px;
  background: var(--danger);
  pointer-events: none;
}
.now-label {
  position: absolute;
  top: -1px;
  z-index: 2;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--danger);
  color: var(--bg);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 18px;
  transform: translateX(-50%);
  pointer-events: none;
}
.cov-wrap { position: relative; }
.now-mark {
  position: absolute;
  top: -5px;
  bottom: -5px;
  width: 3px;
  margin-left: -1.5px;
  border-radius: 2px;
  background: var(--text);
  box-shadow: 0 0 0 1.5px var(--surface);
}
.cov-slot.abs { position: absolute; top: 0; bottom: 0; height: auto; border-radius: 2px; }
.free { margin: 0; }

/* --- Resumen por persona --- */
.summary { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; }
.summary-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.summary-head h2 { margin: 0; }
.sum-table { display: flex; flex-direction: column; }
.sum-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) 150px 60px minmax(140px, 1.2fr) 90px 100px 110px;
  align-items: center;
  gap: 12px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--border);
}
.sum-row.me { background: color-mix(in srgb, var(--accent-soft) 35%, transparent); border-radius: 8px; }
.sum-row.idle .sum-person strong, .sum-row.idle .sum-hours strong { color: var(--text-muted); font-weight: 500; }
.sum-header { padding-top: 0; color: var(--text-muted); font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.sum-total { border-bottom: none; border-top: 1px solid var(--border-strong); }
.num { text-align: right; }
.sum-person { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sum-person strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sum-person .you { margin: 0; }
.sum-days { display: flex; gap: 3px; }
.sum-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}
.sum-day.closed { border-style: dashed; opacity: 0.6; }
.sum-day.on { border-color: var(--accent); background: var(--accent); color: var(--bg); opacity: 1; }
.sum-hours { display: flex; flex-direction: column; gap: 4px; }
.sum-bar { display: block; height: 5px; border-radius: 3px; background: var(--border); overflow: hidden; }
.sum-bar span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.delta.up { color: var(--accent); }
.delta.down { color: var(--color4); }
.warn { color: var(--color5); font-weight: 600; }
.sum-label { display: none; }

/* Estrecho: cada persona es una ficha con sus datos en dos columnas */
@media (max-width: 900px) {
  .sum-header { display: none; }
  .sum-row { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 10px; padding: 12px 6px; }
  .sum-person, .sum-days, .sum-hours { grid-column: 1 / -1; }
  /* Arriba lo que ocupa todo el ancho; debajo, las cuatro cifras en una fila */
  .sum-person { order: -3; }
  .sum-days { order: -2; }
  .sum-hours { order: -1; }
  .sum-total > :nth-child(2), .sum-total > :nth-child(6) { display: none; }
  .num { text-align: left; }
  .sum-label { display: block; white-space: nowrap; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
  .sum-hours .sum-label { margin-bottom: 0; }
}

/* --- Leyenda --- */
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend .cov-slot { width: 18px; height: 10px; border-radius: 3px; }
.chip-swatch { display: inline-block; width: 18px; height: 10px; border-radius: 3px; background: var(--accent-soft); border-left: 3px solid var(--color5); }

/* --- Dialogo --- */
.shift-dialog {
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
}
.shift-dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
.shift-dialog-body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
.dialog-head { display: flex; align-items: center; justify-content: space-between; }
.dialog-head h2 { margin: 0; }
.close { width: 40px; height: 40px; border: none; background: transparent; color: var(--text-muted); font-size: 26px; line-height: 1; cursor: pointer; }
.field { display: flex; flex-direction: column; gap: 6px; }
.day-picks { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.day-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.day-pick.closed { border-style: dashed; color: var(--text-muted); }
.day-pick.on { border-color: var(--accent); border-style: solid; background: var(--accent); color: var(--bg); font-weight: 600; }
.times { display: grid; grid-template-columns: 1fr 1fr auto; align-items: end; gap: 10px; }
.duration { margin: 0 0 10px; min-width: 56px; text-align: right; font-weight: 600; color: var(--accent); }
.duration.bad { color: var(--danger); }
.quick { display: flex; flex-wrap: wrap; gap: 6px; }
.quick-btn {
  display: inline-flex;
  gap: 6px;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}
.quick-btn.active { background: var(--accent); color: var(--bg); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.delete-zone { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding-top: 14px; border-top: 1px solid var(--border); }
.small { font-size: 12.5px; margin: 0; }

@media (max-width: 760px) {
  .g-row { grid-template-columns: 96px 1fr; gap: 8px; }
  .g-name { font-size: 13px; }
  .g-name :deep(.user-avatar) { display: none; }
  .g-bar { padding: 0 6px; font-size: 12px; }
  .g-note { display: none; }
  .toolbar { padding: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .add-slot { transition: none; }
}
</style>
