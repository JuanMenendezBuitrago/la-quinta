<template>
  <!-- Pantallas anchas apaisadas: alta y edicion a la izquierda; listado en la columna de la derecha -->
  <section class="staff-admin wide-layout">
    <div class="wide-main staff-main">
    <!-- En la cabecera de la seccion, a la derecha (solo en cliente: Teleport fuera de #teleports no se renderiza en SSR) -->
    <ClientOnly>
      <Teleport to="#staff-hero-actions">
        <button class="button" @click="startCreate()">+ Nueva cuenta</button>
      </Teleport>
    </ClientOnly>
    <!-- Solo en pantallas anchas: la columna del formulario no queda vacia -->
    <div v-if="!formOpen" class="form-placeholder">
      <EmptyState :icon="UserCog" title="Elige una cuenta para editarla">O crea una nueva con «+ Nueva cuenta».</EmptyState>
    </div>

    <form v-if="formOpen" class="card staff-form" @submit.prevent="submitForm">
      <div class="form-head">
        <h3>{{ form.id ? form.name || "Cuenta" : "Nueva cuenta" }}</h3>
        <button class="close-form" type="button" aria-label="Cerrar" title="Cerrar" :disabled="saving" @click="cancelForm">
          <X :size="22" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <!-- En una cuenta que ya existe: sus datos o el resumen de lo que ha hecho -->
      <div v-if="form.id" class="view-toggle" role="tablist" aria-label="Ver">
        <button type="button" role="tab" :aria-selected="tab === 'datos'" :class="{ on: tab === 'datos' }" @click="tab = 'datos'">
          <UserCog :size="16" :stroke-width="1.8" aria-hidden="true" /> Datos
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'actividad'" :class="{ on: tab === 'actividad' }" @click="tab = 'actividad'">
          <BarChart3 :size="16" :stroke-width="1.8" aria-hidden="true" /> Actividad
        </button>
      </div>

      <StaffActivity v-if="form.id && tab === 'actividad'" :key="form.id" :staff-id="form.id" :shared="form.shared" />

      <!-- Datos a la izquierda; estado de la cuenta y botones a la derecha (en movil, debajo) -->
      <div v-show="!form.id || tab === 'datos'" class="form-grid">
        <div class="form-main">
          <label class="field">
            <span class="muted">Nombre</span>
            <input v-model="form.name" type="text" required maxlength="120" />
          </label>

          <label class="field">
            <span class="muted">Email</span>
            <input v-model="form.email" type="email" required :disabled="!!form.id" />
            <span v-if="form.id" class="muted">El email no se puede cambiar aquí.</span>
          </label>

          <label class="field">
            <span class="muted">{{ form.id ? "Nueva contraseña" : "Contraseña" }}</span>
            <PasswordInput v-model="form.password" :required="!form.id" minlength="8" autocomplete="new-password" />
            <span v-if="form.id" class="muted">Deja en blanco para no cambiarla.</span>
          </label>

          <label class="field">
            <span class="muted">Rol</span>
            <select v-model="form.role" :disabled="isSelf">
              <option value="barra">Barra</option>
              <option value="gestion">Gestión</option>
            </select>
            <span v-if="isSelf" class="muted">No puedes cambiar tu propio rol.</span>
          </label>

          <!-- Avatar de la cuenta que se edita (gestion puede cambiar el de cualquiera). Se guarda al
               elegirlo, sin esperar a "Guardar". -->
          <div v-if="form.id" class="field">
            <span class="muted">{{ isSelf ? "Tu avatar" : "Avatar" }}</span>
            <AvatarPicker
              who="staff"
              :staff-id="form.id"
              :avatar="isSelf ? staff?.avatar : form.avatar"
              :name="form.name"
              @changed="onAvatarChanged"
            />
          </div>

          <!-- Sueldo: lo usa el resumen de actividad para calcular lo que se le debe por sus turnos.
               Una cuenta compartida no trabaja turnos. -->
          <fieldset v-if="!form.shared" class="pay">
            <legend>Sueldo</legend>
            <div class="pay-grid">
              <label class="field">
                <span class="muted">Hora normal</span>
                <span class="money">
                  <span aria-hidden="true">$</span>
                  <input v-model="form.hourlyRate" type="number" inputmode="numeric" min="0" max="10000000" step="1" placeholder="Sin indicar" />
                </span>
              </label>
              <label class="field">
                <span class="muted">Hora extra</span>
                <span class="money">
                  <span aria-hidden="true">$</span>
                  <input v-model="form.overtimeRate" type="number" inputmode="numeric" min="0" max="10000000" step="1" :placeholder="suggestedOvertime ? String(suggestedOvertime) : 'Sin indicar'" />
                </span>
              </label>
              <label class="field">
                <span class="muted">Horas normales / semana</span>
                <input v-model="form.weeklyHours" type="number" inputmode="decimal" min="1" max="84" step="0.25" :placeholder="String(DEFAULT_WEEKLY_HOURS)" />
              </label>
            </div>
            <span class="muted">
              Las horas de sus turnos que pasen de las semanales (de lunes a domingo) cuentan como extra.
              <template v-if="suggestedOvertime && !form.overtimeRate">
                Con el recargo legal de la hora extra diurna (+25 %) serían {{ formatPrice(suggestedOvertime) }}:
                <button class="link-inline" type="button" @click="form.overtimeRate = String(suggestedOvertime)">usar</button>.
              </template>
            </span>
          </fieldset>
        </div>
        <div class="form-side">
          <div v-if="form.id" class="field">
            <label class="switch">
              <input v-model="form.active" type="checkbox" role="switch" :disabled="isSelf" />
              <span>Cuenta activa</span>
            </label>
            <span class="muted">
              {{ isSelf ? "No puedes desactivar tu propia cuenta." : "Desactivada no aparece al entrar al panel, no puede iniciar sesión y se cierra la que tenga abierta." }}
            </span>
          </div>
          <div class="field">
            <label class="switch">
              <input v-model="form.shared" type="checkbox" role="switch" />
              <span>Cuenta compartida</span>
            </label>
            <span class="muted">Al entrar con ella se elige quién la usa, y lo que se haga (pedidos, cobros, cierres…) queda a nombre de esa persona.</span>
          </div>
          <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>
          <div class="form-actions">
            <button class="button" type="submit" :disabled="saving">
              {{ saving ? "Guardando…" : "Guardar" }}
            </button>
            <button class="button secondary cancel" type="button" :disabled="saving" @click="cancelForm">
              <X :size="16" :stroke-width="1.8" aria-hidden="true" />
              Cancelar
            </button>
          </div>
          <!-- Borrar: solo cuentas sin pedidos ni otros registros a su nombre (la API lo comprueba);
               las demas se desactivan, para no dejar el historial sin quien lo hizo -->
          <div v-if="form.id && !isSelf" class="delete-zone">
            <template v-if="!confirmingDelete">
              <button class="button secondary delete" type="button" :disabled="saving || !form.deletable" @click="confirmingDelete = true">
                <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                Eliminar cuenta
              </button>
              <span v-if="!form.deletable" class="muted">Tiene pedidos u otros registros a su nombre: no se puede eliminar, solo desactivar.</span>
            </template>
            <template v-else>
              <span class="muted">¿Eliminar la cuenta de {{ form.name }}? No se puede deshacer.</span>
              <div class="form-actions">
                <button class="button secondary delete" type="button" :disabled="saving" @click="deleteUser">
                  {{ saving ? "Eliminando…" : "Sí, eliminar" }}
                </button>
                <button class="button secondary" type="button" :disabled="saving" @click="confirmingDelete = false">No</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </form>
    </div>

    <aside class="wide-aside wide-aside--sticky staff-list">
    <p v-if="loading" class="muted">Cargando personal…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>
    <div class="card staff-row" :class="{ inactive: !user.active }" v-for="user in staffUsers" :key="user.id">
      <!-- El propio, desde la sesion: cambia al momento al elegir otro avatar -->
      <UserAvatar :avatar="user.id === myId ? staff?.avatar : user.avatar" :name="user.name" :size="40" />
      <div class="staff-info">
        <strong>{{ user.name }}</strong>
        <span v-if="user.id === myId" class="muted"> · tú</span>
        <span v-if="!user.active" class="inactive-badge">Desactivada</span>
        <span v-if="user.shared" class="inactive-badge">Compartida</span>
        <p class="muted">{{ user.email }} · {{ user.role }}</p>
      </div>
      <div class="row-actions">
        <button class="icon-button" type="button" aria-label="Ver actividad" title="Ver actividad" @click="startEdit(user, 'actividad')">
          <BarChart3 :size="18" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button class="button secondary" type="button" @click="startEdit(user)">Editar</button>
      </div>
    </div>
    <EmptyState v-if="!loading && !staffUsers.length" :icon="Users" title="No hay cuentas de personal todavía" />
    </aside>
  </section>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { BarChart3, Trash2, UserCog, Users, X } from "lucide-vue-next";
import StaffActivity from "~/components/StaffActivity.vue";
import { gql } from "graphql-tag";
import { useStaffAuth } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";
import AvatarPicker from "~/components/AvatarPicker.vue";
import PasswordInput from "~/components/PasswordInput.vue";
import { SITE_SETTINGS_QUERY, type SiteSettings } from "~/composables/useSiteSettings";

interface StaffUserAdmin {
  id: string;
  name: string;
  email: string;
  role: "barra" | "gestion";
  avatar?: string | null;
  active: boolean;
  shared: boolean;
  deletable: boolean;
  pay?: { hourlyRateCents: number | null; overtimeRateCents: number | null; weeklyHours: number } | null;
}

/** Jornada por defecto (la misma que la API, users/model.ts). */
const DEFAULT_WEEKLY_HOURS = 42;

const STAFF_USERS_QUERY = gql`
  query StaffUsers {
    staffUsers {
      id
      name
      email
      role
      avatar
      active
      shared
      deletable
      pay {
        hourlyRateCents
        overtimeRateCents
        weeklyHours
      }
    }
  }
`;

const CREATE_STAFF_USER = gql`
  mutation CreateStaffUser($name: String!, $email: String!, $password: String!, $role: StaffRole!, $shared: Boolean) {
    createStaffUser(name: $name, email: $email, password: $password, role: $role, shared: $shared) {
      id
    }
  }
`;

const UPDATE_STAFF_USER = gql`
  mutation UpdateStaffUser($id: ID!, $name: String, $role: StaffRole, $password: String, $active: Boolean, $shared: Boolean) {
    updateStaffUser(id: $id, name: $name, role: $role, password: $password, active: $active, shared: $shared) {
      id
    }
  }
`;

const SET_STAFF_PAY = gql`
  mutation SetStaffPay($id: ID!, $hourlyRateCents: Int, $overtimeRateCents: Int, $weeklyHours: Float) {
    setStaffPay(id: $id, hourlyRateCents: $hourlyRateCents, overtimeRateCents: $overtimeRateCents, weeklyHours: $weeklyHours) {
      id
    }
  }
`;

const DELETE_STAFF_USER = gql`
  mutation DeleteStaffUser($id: ID!) {
    deleteStaffUser(id: $id)
  }
`;

const { staff, loginById } = useStaffAuth();
const myId = computed(() => staff.value?.id ?? "");

const { result, loading, error, refetch } = useQuery<{ staffUsers: StaffUserAdmin[] }>(STAFF_USERS_QUERY);
// Las desactivadas, solo si Configuracion lo permite (la propia cuenta siempre esta activa).
const { result: settingsResult } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const showInactive = computed(() => settingsResult.value?.siteSettings.showInactiveStaff !== false);
const staffUsers = computed(() => (result.value?.staffUsers ?? []).filter((u) => u.active || showInactive.value));
const loadError = computed(() => (error.value ? "No se pudo cargar el personal." : ""));

const formOpen = ref(false);
const saving = ref(false);
const formError = ref("");
const confirmingDelete = ref(false);

function emptyForm() {
  return {
    id: "" as string,
    name: "",
    email: "",
    password: "",
    role: "barra" as "barra" | "gestion",
    active: true,
    shared: false,
    deletable: false,
    avatar: null as string | null | undefined,
    // Sueldo, como texto del input (vacio: sin indicar)
    hourlyRate: "",
    overtimeRate: "",
    weeklyHours: "",
  };
}
const tab = ref<"datos" | "actividad">("datos");
const form = reactive(emptyForm());
const isSelf = computed(() => !!form.id && form.id === myId.value);

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  confirmingDelete.value = false;
  tab.value = "datos";
  formOpen.value = true;
}

// Al pasar de una persona a otra se queda en la pestaña que se estaba viendo, salvo que se pida una.
function startEdit(user: StaffUserAdmin, view?: "datos" | "actividad") {
  Object.assign(form, {
    id: user.id,
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    active: user.active,
    shared: user.shared,
    deletable: user.deletable,
    avatar: user.avatar,
    hourlyRate: user.pay?.hourlyRateCents != null ? String(user.pay.hourlyRateCents) : "",
    overtimeRate: user.pay?.overtimeRateCents != null ? String(user.pay.overtimeRateCents) : "",
    weeklyHours: user.pay && user.pay.weeklyHours !== DEFAULT_WEEKLY_HOURS ? String(user.pay.weeklyHours) : "",
  });
  if (view) tab.value = view;
  formError.value = "";
  confirmingDelete.value = false;
  formOpen.value = true;
}

const suggestedOvertime = computed(() => {
  const hourly = Number(form.hourlyRate);
  return form.hourlyRate !== "" && hourly > 0 ? Math.round(hourly * 1.25) : 0;
});

function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

/** Lo que se envia del sueldo (null: sin indicar). Lanza un error legible si algo no vale. */
function payInput() {
  const rate = (text: string | number, label: string) => {
    if (text === "" || text == null) return null;
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${label}: escribe un importe en pesos, sin decimales`);
    return n;
  };
  const weekly = form.weeklyHours === "" || form.weeklyHours == null ? null : Number(form.weeklyHours);
  if (weekly != null && !(weekly >= 1 && weekly <= 84)) throw new Error("Las horas normales por semana deben estar entre 1 y 84");
  return {
    hourlyRateCents: rate(form.hourlyRate, "Hora normal"),
    overtimeRateCents: rate(form.overtimeRate, "Hora extra"),
    weeklyHours: weekly,
  };
}

// El avatar se guarda en el momento: se refleja en el formulario y en el listado.
function onAvatarChanged(avatar: string | null) {
  form.avatar = avatar;
  refetch();
}

function cancelForm() {
  formOpen.value = false;
  formError.value = "";
  confirmingDelete.value = false;
}

async function deleteUser() {
  saving.value = true;
  formError.value = "";
  try {
    const { mutate } = useMutation(DELETE_STAFF_USER);
    await mutate({ id: form.id });
    await refetch();
    cancelForm();
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo eliminar la cuenta";
    confirmingDelete.value = false;
  } finally {
    saving.value = false;
  }
}

async function submitForm() {
  saving.value = true;
  formError.value = "";
  try {
    const pay = form.shared ? null : payInput();
    if (form.id) {
      const { mutate } = useMutation(UPDATE_STAFF_USER);
      await mutate({
        id: form.id,
        name: form.name.trim(),
        role: form.role,
        password: form.password || undefined,
        active: form.active,
        shared: form.shared,
      });
      // Cambiar la contraseña cierra las sesiones abiertas de esa cuenta, la propia incluida: se
      // vuelve a entrar con la nueva para no echar a quien la acaba de cambiar.
      if (isSelf.value && form.password) await loginById(form.id, form.password);
      if (pay) await useMutation(SET_STAFF_PAY).mutate({ id: form.id, ...pay });
    } else {
      const { mutate } = useMutation(CREATE_STAFF_USER);
      const created = await mutate({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        shared: form.shared,
      });
      const id = created?.data?.createStaffUser?.id;
      if (pay && id && Object.values(pay).some((v) => v != null)) await useMutation(SET_STAFF_PAY).mutate({ id, ...pay });
    }
    await refetch();
    formOpen.value = false;
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar la cuenta";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.staff-main { gap: 0; }
.delete-zone { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-placeholder { display: none; }
@media (min-width: 1000px) and (orientation: landscape) { .form-placeholder { display: block; } }
.staff-list { gap: 0; }
.staff-list .staff-row:first-of-type { margin-top: 0; }
.staff-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 10px; }
.staff-info { flex: 1; }
.staff-row.inactive .user-avatar, .staff-row.inactive strong { opacity: 0.55; }
.inactive-badge {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--text-muted);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Interruptor: el checkbox con aspecto de switch (estilo global en main.css) y su texto al lado */
.switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; }
.switch input { margin: 0; }
.switch:has(input:disabled) { cursor: not-allowed; }

.staff-form { margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
.form-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.form-head h3 { margin: 0; }
.close-form {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: -8px -10px -8px 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.close-form:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }
.close-form:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.close-form:disabled { opacity: 0.45; cursor: not-allowed; }
.form-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 24px; align-items: start; }
.form-main, .form-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
@media (max-width: 700px) { .form-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
.field { display: flex; flex-direction: column; gap: 4px; }
.form-actions { display: flex; gap: 8px; margin-top: 4px; }
/* Si la columna no da para Guardar y Cancelar en fila (~252 px), se apilan a todo el ancho */
.form-side { container-type: inline-size; }
@container (max-width: 260px) {
  .form-actions { flex-direction: column; }
  .form-actions .button { width: 100%; }
}

/* Pestañas Datos / Actividad (como la vista Semana / Dia de los turnos) */
.view-toggle { display: inline-flex; align-self: flex-start; padding: 3px; border: 1px solid var(--border-strong); border-radius: 10px; }
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
.view-toggle button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.row-actions { display: flex; align-items: center; gap: 6px; }
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.icon-button:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
.icon-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.pay { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 0; padding: 12px 14px 14px; border: 1px solid var(--border-strong); border-radius: 10px; }
.pay legend { padding: 0 6px; font-weight: 700; }
.pay > .muted { font-size: 13px; }
.pay-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.money { position: relative; display: block; }
.money > span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.money input { padding-left: 26px; width: 100%; }
.link-inline { border: none; background: none; padding: 0; color: var(--accent); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }

select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
