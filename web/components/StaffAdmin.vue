<template>
  <section class="staff-admin">
    <div class="staff-admin-header">
      <button class="button" :disabled="formOpen" @click="startCreate()">+ Nueva cuenta</button>
    </div>

    <p v-if="loading" class="muted">Cargando personal…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <form v-if="formOpen" class="card staff-form" @submit.prevent="submitForm">
      <h3>{{ form.id ? "Editar cuenta" : "Nueva cuenta" }}</h3>

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

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>

      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? "Guardando…" : "Guardar" }}
        </button>
        <button class="button secondary" type="button" :disabled="saving" @click="cancelForm">
          Cancelar
        </button>
      </div>
    </form>

    <div class="card staff-row" v-for="user in staffUsers" :key="user.id">
      <div class="staff-info">
        <strong>{{ user.name }}</strong>
        <span v-if="user.id === myId" class="muted"> · tú</span>
        <p class="muted">{{ user.email }} · {{ user.role }}</p>
      </div>
      <button class="button secondary" type="button" @click="startEdit(user)">Editar</button>
    </div>
    <p v-if="!loading && !staffUsers.length" class="muted">No hay cuentas de personal todavía.</p>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useStaffAuth } from "~/composables/useAuth";

interface StaffUserAdmin {
  id: string;
  name: string;
  email: string;
  role: "barra" | "gestion";
}

const STAFF_USERS_QUERY = gql`
  query StaffUsers {
    staffUsers {
      id
      name
      email
      role
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
  mutation UpdateStaffUser($id: ID!, $name: String, $role: StaffRole, $password: String) {
    updateStaffUser(id: $id, name: $name, role: $role, password: $password) {
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
  return { id: "" as string, name: "", email: "", password: "", role: "barra" as "barra" | "gestion" };
}
const form = reactive(emptyForm());
const isSelf = computed(() => !!form.id && form.id === myId.value);

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  formOpen.value = true;
}

function startEdit(user: StaffUserAdmin) {
  Object.assign(form, { id: user.id, name: user.name, email: user.email, password: "", role: user.role });
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

.staff-form { margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
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
