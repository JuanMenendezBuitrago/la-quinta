<template>
  <div class="staff-login">
    <!-- 1. Elegir cuenta (como la pantalla de acceso de un ordenador compartido) -->
    <template v-if="mode === 'pick'">
      <p class="muted">¿Quién eres?</p>
      <ul class="accounts">
        <li v-for="option in options" :key="option.id">
          <button type="button" class="account" @click="pick(option)">
            <UserAvatar :avatar="option.avatar" :name="option.name" :size="72" />
            <span class="account-name">{{ option.name }}</span>
          </button>
        </li>
      </ul>
      <button type="button" class="link-button" @click="mode = 'email'">Entrar con email</button>
    </template>

    <!-- 2. Cuenta elegida: solo la contraseña -->
    <form v-else-if="mode === 'password' && selected" class="card login-card selected" @submit.prevent="submitPassword">
      <UserAvatar :avatar="selected.avatar" :name="selected.name" :size="96" />
      <strong class="selected-name">{{ selected.name }}</strong>
      <label class="sr-only" for="staff-login-password">Contraseña</label>
      <input
        id="staff-login-password"
        ref="passwordInput"
        v-model="password"
        type="password"
        placeholder="Contraseña"
        autocomplete="current-password"
        required
      />
      <button class="button" type="submit" :disabled="loggingIn || !password">
        {{ loggingIn ? "Entrando…" : "Entrar" }}
      </button>
      <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
      <button type="button" class="link-button" @click="backToList">Cambiar de cuenta</button>
    </form>

    <!-- 3. Email y contraseña: si la lista no carga o la cuenta no aparece -->
    <form v-else class="card login-card" @submit.prevent="submitEmail">
      <input v-model="email" type="email" placeholder="Email del equipo" autocomplete="username" required />
      <input v-model="password" type="password" placeholder="Contraseña" autocomplete="current-password" required />
      <button class="button" type="submit" :disabled="loggingIn">
        {{ loggingIn ? "Entrando…" : "Entrar" }}
      </button>
      <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
      <button v-if="options.length" type="button" class="link-button" @click="backToList">Volver a la lista</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useStaffAuth } from "~/composables/useAuth";
import { primeAudio } from "~/composables/useOrderChime";
import UserAvatar from "~/components/UserAvatar.vue";

interface StaffLoginOption {
  id: string;
  name: string;
  avatar?: string | null;
}

const STAFF_LOGIN_OPTIONS = gql`
  query StaffLoginOptions {
    staffLoginOptions {
      id
      name
      avatar
    }
  }
`;

const { login, loginById } = useStaffAuth();
const { result } = useQuery<{ staffLoginOptions: StaffLoginOption[] }>(STAFF_LOGIN_OPTIONS, null, {
  fetchPolicy: "network-only",
});
const options = computed(() => result.value?.staffLoginOptions ?? []);

const chosenMode = ref<"pick" | "password" | "email" | null>(null);
// Mientras no se elige nada: la lista si hay cuentas; si no cargan, directamente email.
const mode = computed(() => chosenMode.value ?? (options.value.length ? "pick" : "email"));
const selected = ref<StaffLoginOption | null>(null);
const email = ref("");
const password = ref("");
const loggingIn = ref(false);
const loginError = ref("");
const passwordInput = ref<HTMLInputElement | null>(null);

async function pick(option: StaffLoginOption) {
  selected.value = option;
  password.value = "";
  loginError.value = "";
  chosenMode.value = "password";
  await nextTick();
  passwordInput.value?.focus();
}

function backToList() {
  selected.value = null;
  password.value = "";
  loginError.value = "";
  chosenMode.value = "pick";
}

async function run(action: () => Promise<unknown>) {
  // Sincrono y antes del primer `await`: es el gesto de usuario que desbloquea el audio.
  primeAudio();
  loggingIn.value = true;
  loginError.value = "";
  try {
    await action();
  } catch (err: any) {
    loginError.value = err?.message ?? "No se pudo iniciar sesión";
    password.value = "";
  } finally {
    loggingIn.value = false;
  }
}

function submitPassword() {
  const option = selected.value;
  if (option) run(() => loginById(option.id, password.value));
}

function submitEmail() {
  run(() => login(email.value, password.value));
}
</script>

<style scoped>
/* Todo centrado, como la pantalla de acceso de un ordenador */
.staff-login { display: flex; flex-direction: column; align-items: center; text-align: center; }
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

.login-card { width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.login-card.selected { align-items: center; text-align: center; }
.login-card.selected input, .login-card.selected .button { width: 100%; }
.selected-name { font-family: var(--font-futura-text); font-size: 18px; margin-bottom: 4px; }
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
