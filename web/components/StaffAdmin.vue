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
        <h3>{{ form.id ? "Editar cuenta" : "Nueva cuenta" }}</h3>
        <button class="close-form" type="button" aria-label="Cerrar" title="Cerrar" :disabled="saving" @click="cancelForm">
          <X :size="22" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <!-- Datos a la izquierda; estado de la cuenta y botones a la derecha (en movil, debajo) -->
      <div class="form-grid">
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
        </div>
        <div class="form-side">
          <div v-if="form.id" class="field">
            <label class="switch">
              <input v-model="form.active" type="checkbox" role="switch" :disabled="isSelf" />
              <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
              <span>Cuenta activa</span>
            </label>
            <span class="muted">
              {{ isSelf ? "No puedes desactivar tu propia cuenta." : "Desactivada no aparece al entrar al panel, no puede iniciar sesión y se cierra la que tenga abierta." }}
            </span>
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
        <p class="muted">{{ user.email }} · {{ user.role }}</p>
      </div>
      <button class="button secondary" type="button" @click="startEdit(user)">Editar</button>
    </div>
    <EmptyState v-if="!loading && !staffUsers.length" :icon="Users" title="No hay cuentas de personal todavía" />
    </aside>
  </section>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { Trash2, UserCog, Users, X } from "lucide-vue-next";
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
  deletable: boolean;
}

const STAFF_USERS_QUERY = gql`
  query StaffUsers {
    staffUsers {
      id
      name
      email
      role
      avatar
      active
      deletable
    }
  }
`;

const CREATE_STAFF_USER = gql`
  mutation CreateStaffUser($name: String!, $email: String!, $password: String!, $role: StaffRole!) {
    createStaffUser(name: $name, email: $email, password: $password, role: $role) {
      id
    }
  }
`;

const UPDATE_STAFF_USER = gql`
  mutation UpdateStaffUser($id: ID!, $name: String, $role: StaffRole, $password: String, $active: Boolean) {
    updateStaffUser(id: $id, name: $name, role: $role, password: $password, active: $active) {
      id
    }
  }
`;

const DELETE_STAFF_USER = gql`
  mutation DeleteStaffUser($id: ID!) {
    deleteStaffUser(id: $id)
  }
`;

const { staff } = useStaffAuth();
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
    deletable: false,
    avatar: null as string | null | undefined,
  };
}
const form = reactive(emptyForm());
const isSelf = computed(() => !!form.id && form.id === myId.value);

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  confirmingDelete.value = false;
  formOpen.value = true;
}

function startEdit(user: StaffUserAdmin) {
  Object.assign(form, {
    id: user.id,
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    active: user.active,
    deletable: user.deletable,
    avatar: user.avatar,
  });
  formError.value = "";
  confirmingDelete.value = false;
  formOpen.value = true;
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
    if (form.id) {
      const { mutate } = useMutation(UPDATE_STAFF_USER);
      await mutate({
        id: form.id,
        name: form.name.trim(),
        role: form.role,
        password: form.password || undefined,
        active: form.active,
      });
    } else {
      const { mutate } = useMutation(CREATE_STAFF_USER);
      await mutate({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
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

/* Interruptor: el checkbox real (role=switch) queda encima, invisible pero enfocable */
.switch { position: relative; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600; }
.switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; }
.switch-track {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--field-border);
  background: var(--surface-alt);
  transition: background 0.15s ease, border-color 0.15s ease;
  flex-shrink: 0;
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform 0.15s ease, background 0.15s ease;
}
.switch input:checked + .switch-track { background: var(--accent); border-color: var(--accent); }
.switch input:checked + .switch-track .switch-thumb { transform: translateX(18px); background: var(--bg); }
.switch input:focus-visible + .switch-track { outline: 2px solid var(--accent); outline-offset: 2px; }
.switch:has(input:disabled) { cursor: not-allowed; opacity: 0.6; }
@media (prefers-reduced-motion: reduce) { .switch-track, .switch-thumb { transition: none; } }

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

select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
