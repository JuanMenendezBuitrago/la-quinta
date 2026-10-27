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
      <button type="button" class="link-button" @click="chosenMode = 'email'">Entrar con email</button>
    </template>

    <!-- 2. Cuenta elegida: solo la contraseña -->
    <form v-else-if="mode === 'password' && selected" class="card login-card selected" @submit.prevent="submitPassword">
      <UserAvatar :avatar="selected.avatar" :name="selected.name" :size="96" />
      <strong class="selected-name">{{ selected.name }}</strong>
      <label class="sr-only" for="staff-login-password">Contraseña</label>
      <PasswordInput
        id="staff-login-password"
        ref="passwordInput"
        v-model="password"
        placeholder="Contraseña"
        autocomplete="current-password"
        required
      />
      <button class="button" type="submit" :disabled="loggingIn || !password">
        {{ loggingIn ? "Entrando…" : "Entrar" }}
      </button>
      <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
      <button type="button" class="link-button" :disabled="sendingCode" @click="sendCode">
        {{ sendingCode ? "Enviando código…" : "¿Has olvidado tu contraseña?" }}
      </button>
      <button type="button" class="link-button" @click="backToList">Cambiar de cuenta</button>
    </form>

    <!-- 4. Contraseña olvidada, entrando con email: a que email se envia el codigo -->
    <form v-else-if="mode === 'forgot-email'" class="card login-card" @submit.prevent="sendCode">
      <p class="muted hint">Te enviaremos un código a tu email del equipo para poner una contraseña nueva.</p>
      <input v-model="email" type="email" placeholder="Email del equipo" autocomplete="username" required />
      <button class="button" type="submit" :disabled="sendingCode">
        {{ sendingCode ? "Enviando…" : "Enviar código" }}
      </button>
      <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
      <button type="button" class="link-button" @click="backFromReset">Volver</button>
    </form>

    <!-- 5. Codigo recibido: contraseña nueva (y se entra con ella) -->
    <form v-else-if="mode === 'reset'" class="card login-card" :class="{ selected: !!selected }" @submit.prevent="submitReset">
      <template v-if="selected">
        <UserAvatar :avatar="selected.avatar" :name="selected.name" :size="72" />
        <strong class="selected-name">{{ selected.name }}</strong>
      </template>
      <!-- Sin email donde mandar el codigo: solo gestion puede ponerle una contraseña nueva -->
      <template v-if="!sentTo">
        <p class="muted hint">
          Esta cuenta no tiene un email donde enviar el código. Pide a alguien de gestión que te ponga una contraseña
          nueva en <strong>Personal</strong>.
        </p>
      </template>
      <template v-else>
        <p class="muted hint">
          {{ selected ? "Te hemos enviado" : "Si es un email del equipo, te hemos enviado" }} un código a
          <strong>{{ sentTo }}</strong>. Caduca en 15 minutos.
        </p>
        <CodeInput ref="codeInput" v-model="code" @submit="newPasswordInput?.focus()" />
        <label class="sr-only" for="staff-reset-password">Contraseña nueva</label>
        <PasswordInput
          id="staff-reset-password"
          ref="newPasswordInput"
          v-model="newPassword"
          placeholder="Contraseña nueva (mín. 8)"
          autocomplete="new-password"
          minlength="8"
          required
        />
        <button class="button" type="submit" :disabled="loggingIn || code.length < 6 || newPassword.length < 8">
          {{ loggingIn ? "Guardando…" : "Guardar y entrar" }}
        </button>
        <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
        <button type="button" class="link-button" :disabled="sendingCode" @click="sendCode">
          {{ sendingCode ? "Enviando…" : "Enviar otro código" }}
        </button>
      </template>
      <button type="button" class="link-button" @click="backFromReset">Volver</button>
    </form>

    <!-- 3. Email y contraseña: si la lista no carga o la cuenta no aparece -->
    <form v-else class="card login-card" @submit.prevent="submitEmail">
      <input v-model="email" type="email" placeholder="Email del equipo" autocomplete="username" required />
      <PasswordInput v-model="password" placeholder="Contraseña" autocomplete="current-password" required />
      <button class="button" type="submit" :disabled="loggingIn">
        {{ loggingIn ? "Entrando…" : "Entrar" }}
      </button>
      <p v-if="loginError" class="muted error" role="alert">{{ loginError }}</p>
      <button type="button" class="link-button" @click="goForgotEmail">¿Has olvidado tu contraseña?</button>
      <button v-if="options.length" type="button" class="link-button" @click="backToList">Volver a la lista</button>
    </form>

    <!-- Por si un cliente llega aqui (p. ej. desde el enlace del pie): su acceso es otro -->
    <p class="customer-link muted">¿Eres cliente? <NuxtLink to="/cuenta">Entra en tu cuenta</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useStaffAuth } from "~/composables/useAuth";
import { primeAudio } from "~/composables/useOrderChime";
import UserAvatar from "~/components/UserAvatar.vue";
import PasswordInput from "~/components/PasswordInput.vue";
import CodeInput from "~/components/CodeInput.vue";

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

const { login, loginById, requestPasswordReset, resetPasswordWithCode } = useStaffAuth();
const { result } = useQuery<{ staffLoginOptions: StaffLoginOption[] }>(STAFF_LOGIN_OPTIONS, null, {
  fetchPolicy: "network-only",
});
const options = computed(() => result.value?.staffLoginOptions ?? []);

const chosenMode = ref<"pick" | "password" | "email" | "forgot-email" | "reset" | null>(null);
// Mientras no se elige nada: la lista si hay cuentas; si no cargan, directamente email.
const mode = computed(() => chosenMode.value ?? (options.value.length ? "pick" : "email"));
const selected = ref<StaffLoginOption | null>(null);
const email = ref("");
const password = ref("");
const loggingIn = ref(false);
const loginError = ref("");
const passwordInput = ref<InstanceType<typeof PasswordInput> | null>(null);

// Contraseña olvidada: a que email (enmascarado) se envio el codigo; null si la cuenta no tiene.
const sentTo = ref<string | null>(null);
const code = ref("");
const newPassword = ref("");
const sendingCode = ref(false);
const codeInput = ref<InstanceType<typeof CodeInput> | null>(null);
const newPasswordInput = ref<InstanceType<typeof PasswordInput> | null>(null);

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
    // Al entrar, siempre la seccion por defecto (la cola o, si esta desactivada, tomar pedido),
    // aunque se llegara al login desde otra seccion (sesion caducada, enlace...).
    await navigateTo("/staff", { replace: true });
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

/** La cuenta a la que se le cambia la contraseña: la elegida en la lista o la del email. */
function resetTarget() {
  return selected.value ? { id: selected.value.id } : { email: email.value };
}

async function sendCode() {
  sendingCode.value = true;
  loginError.value = "";
  try {
    sentTo.value = await requestPasswordReset(resetTarget());
    code.value = "";
    newPassword.value = "";
    chosenMode.value = "reset";
    await nextTick();
    codeInput.value?.focus();
  } catch (err: any) {
    loginError.value = err?.message ?? "No se pudo enviar el código";
  } finally {
    sendingCode.value = false;
  }
}

function goForgotEmail() {
  loginError.value = "";
  chosenMode.value = "forgot-email";
}

function backFromReset() {
  loginError.value = "";
  code.value = "";
  newPassword.value = "";
  password.value = "";
  chosenMode.value = selected.value ? "password" : "email";
}

function submitReset() {
  run(() => resetPasswordWithCode(resetTarget(), code.value.trim(), newPassword.value));
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
.hint { margin: 0 0 4px; font-size: 14px; }
.login-card.selected .hint { text-align: center; }
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
.customer-link { margin: 28px 0 0; font-size: 14px; }
.customer-link a { color: var(--accent); text-underline-offset: 2px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
