<template>
  <section class="staff-admin">
    <div class="staff-admin-header">
      <button class="button" :disabled="formOpen" @click="startCreate()">+ Nueva cuenta</button>
    </div>

    <p v-if="loading" class="muted">Cargando personal…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <form v-if="formOpen" class="card staff-form" @submit.prevent="submitForm">
      <h3>{{ form.id ? "Editar cuenta" : "Nueva cuenta" }}</h3>
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
            <input v-model="form.password" type="password" :required="!form.id" minlength="8" />
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

          <!-- Solo el propio avatar: cada uno elige el suyo (puede ser una foto suya). Se guarda al
               elegirlo, sin esperar a "Guardar". -->
          <div v-if="isSelf" class="field">
            <span class="muted">Tu avatar</span>
            <AvatarPicker who="staff" :avatar="staff?.avatar" :name="staff?.name" />
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
              <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </form>

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
    <p v-if="!loading && !staffUsers.length" class="muted">No hay cuentas de personal todavía.</p>
  </section>
</template>

<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import { gql } from "graphql-tag";
import { useStaffAuth } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";
import AvatarPicker from "~/components/AvatarPicker.vue";

interface StaffUserAdmin {
  id: string;
  name: string;
  email: string;
  role: "barra" | "gestion";
  avatar?: string | null;
  active: boolean;
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

const { staff } = useStaffAuth();
const myId = computed(() => staff.value?.id ?? "");

const { result, loading, error, refetch } = useQuery<{ staffUsers: StaffUserAdmin[] }>(STAFF_USERS_QUERY);
const staffUsers = computed(() => result.value?.staffUsers ?? []);
const loadError = computed(() => (error.value ? "No se pudo cargar el personal." : ""));

const formOpen = ref(false);
const saving = ref(false);
const formError = ref("");

function emptyForm() {
  return { id: "" as string, name: "", email: "", password: "", role: "barra" as "barra" | "gestion", active: true };
}
const form = reactive(emptyForm());
const isSelf = computed(() => !!form.id && form.id === myId.value);

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  formOpen.value = true;
}

function startEdit(user: StaffUserAdmin) {
  Object.assign(form, { id: user.id, name: user.name, email: user.email, password: "", role: user.role, active: user.active });
  formError.value = "";
  formOpen.value = true;
}

function cancelForm() {
  formOpen.value = false;
  formError.value = "";
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
.staff-admin-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
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
.form-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 24px; align-items: start; }
.form-main, .form-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
@media (max-width: 700px) { .form-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
.field { display: flex; flex-direction: column; gap: 4px; }
.form-actions { display: flex; gap: 8px; margin-top: 4px; }

select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
