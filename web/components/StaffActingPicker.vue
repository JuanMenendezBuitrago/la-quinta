<template>
  <!-- Cuenta compartida: quien la esta usando. Sin contraseña: solo decide a nombre de quien queda
       lo que se haga (los permisos siguen siendo los de la cuenta). -->
  <div class="acting-picker">
    <p class="muted">Entraste con <strong>{{ staff?.name }}</strong>. ¿Quién eres?</p>
    <p v-if="loading && !options.length" class="muted">Cargando…</p>
    <ul class="accounts">
      <li v-for="option in options" :key="option.id">
        <button type="button" class="account" :disabled="busy" @click="choose(option)">
          <UserAvatar :avatar="option.avatar" :name="option.name" :size="72" />
          <span class="account-name">{{ option.name }}</span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
    <p class="muted">Después se cambia al momento con los avatares de la cabecera.</p>
  </div>
</template>

<script setup lang="ts">
import { ACTING_STAFF_OPTIONS, useStaffAuth, type StaffPerson } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";

const { staff, setActingStaff } = useStaffAuth();
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
.account:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.account-name { font-weight: 600; font-size: 14px; text-align: center; overflow-wrap: anywhere; }
.error { color: var(--danger); margin: 0; }
</style>
