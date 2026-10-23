<template>
  <!-- Cuenta compartida: quien la esta usando. Sin contraseña: solo decide a nombre de quien queda
       lo que se haga (los permisos siguen siendo los de la cuenta). -->
  <div class="acting-picker">
    <p class="muted">Entraste con <strong>{{ staff?.name }}</strong>. ¿Quién eres?</p>
    <p v-if="loading && !options.length" class="muted">Cargando…</p>
    <ul class="accounts">
      <li v-for="option in options" :key="option.id">
        <button
          type="button"
          class="account"
          :class="{ current: option.id === staff?.actingAs?.id }"
          :aria-current="option.id === staff?.actingAs?.id ? 'true' : undefined"
          :disabled="busy"
          @click="choose(option)"
        >
          <UserAvatar :avatar="option.avatar" :name="option.name" :size="72" />
          <span class="account-name">{{ option.name }}</span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
    <button v-if="staff?.actingAs" type="button" class="link-button" @click="choosingPerson = false">
      Seguir como {{ staff.actingAs.name }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useStaffAuth, type StaffPerson } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";

const ACTING_STAFF_OPTIONS = gql`
  query ActingStaffOptions {
    actingStaffOptions {
      id
      name
      avatar
    }
  }
`;

const { staff, setActingStaff, choosingPerson } = useStaffAuth();
const { result, loading } = useQuery<{ actingStaffOptions: StaffPerson[] }>(ACTING_STAFF_OPTIONS, null, {
  fetchPolicy: "network-only",
});
const options = computed(() => result.value?.actingStaffOptions ?? []);

const busy = ref(false);
const error = ref("");

async function choose(person: StaffPerson) {
  busy.value = true;
  error.value = "";
  try {
    await setActingStaff(person);
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo elegir";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
/* Como la lista de cuentas del login (StaffLogin.vue) */
.acting-picker { display: flex; flex-direction: column; align-items: center; text-align: center; }
.accounts {
  list-style: none;
  margin: 12px 0 20px;
  padding: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, 140px);
  justify-content: center;
  gap: 12px;
}
.accounts li { display: flex; }
.account {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.account:hover { border-color: var(--field-border); }
.account.current { border-color: var(--accent); }
.account:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.account-name { font-weight: 600; font-size: 14px; text-align: center; overflow-wrap: anywhere; }
.error { color: var(--danger); margin: 0; }
.link-button {
  border: none;
  background: none;
  padding: 4px 0;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
</style>
