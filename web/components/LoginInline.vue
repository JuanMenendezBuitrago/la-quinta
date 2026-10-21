<template>
  <div class="login-inline">
    <template v-if="step === 'identifier'">
      <input v-model="identifier" type="text" placeholder="Email o teléfono" />
      <button class="button" style="margin-top: 8px" :disabled="!identifier || sending" @click="sendCode">
        {{ sending ? "Enviando…" : "Enviar código" }}
      </button>
    </template>

    <template v-else>
      <p class="muted">Te hemos enviado un código a {{ identifier }}.</p>
      <!-- Una casilla por digito; se avanza al escribir, se retrocede con borrar y se puede pegar el
           codigo entero (o que el movil lo autocomplete) en cualquiera de ellas. -->
      <div class="code-boxes" role="group" aria-label="Código de 6 dígitos">
        <input
          v-for="(_, i) in digits"
          :key="i"
          :ref="(el) => (boxes[i] = el as HTMLInputElement)"
          :value="digits[i]"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          :autocomplete="i === 0 ? 'one-time-code' : 'off'"
          :aria-label="`Dígito ${i + 1} de ${CODE_LENGTH}`"
          @input="onDigitInput(i, $event)"
          @keydown="onDigitKeydown(i, $event)"
          @paste.prevent="onPaste(i, $event)"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </div>
      <input
        v-if="requirements.askName"
        v-model="name"
        type="text"
        placeholder="Tu nombre (solo la primera vez)"
        style="margin-top: 8px"
      />
      <label v-if="requirements.askPrivacyConsent" class="consent">
        <input v-model="acceptPrivacy" type="checkbox" />
        <span>
          Autorizo a La Quinta a tratar mis datos (nombre, email o teléfono y pedidos) para gestionar
          mis pedidos y mis sellos, según la
          <!-- En pestaña nueva: el carrito vive en memoria y se perderia al navegar. -->
          <a href="/privacidad" target="_blank" rel="noopener">política de tratamiento de datos</a>.
        </span>
      </label>
      <!-- Alta con email: novedades opcionales, desmarcadas (la autorizacion tiene que ser expresa).
           Se puede cambiar despues en Mi cuenta. -->
      <label v-if="requirements.askName && isEmail" class="consent">
        <input v-model="subscribeNewsletter" type="checkbox" />
        <span>
          Quiero recibir por email novedades de La Quinta: ofertas, eventos y nuevos cafés
          (opcional; puedo darme de baja cuando quiera).
        </span>
      </label>
      <button
        class="button"
        style="margin-top: 8px"
        :disabled="!canVerify"
        @click="verify"
      >
        {{ verifying ? "Comprobando…" : "Confirmar" }}
      </button>
    </template>

    <p v-if="error" class="muted" style="color: var(--danger)">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { useAuth, type LoginRequirements } from "~/composables/useAuth";

const emit = defineEmits<{ (e: "logged-in"): void }>();

const { requestCode, verifyCode } = useAuth();
const step = ref<"identifier" | "code">("identifier");
const identifier = ref("");
const CODE_LENGTH = 6;
const digits = ref<string[]>(Array(CODE_LENGTH).fill(""));
const boxes: HTMLInputElement[] = [];
const code = computed(() => digits.value.join(""));
const name = ref("");
const sending = ref(false);
const verifying = ref(false);
const error = ref("");
const requirements = ref<LoginRequirements>({ askName: false, askPrivacyConsent: false });
const acceptPrivacy = ref(false);
const subscribeNewsletter = ref(false);
const canVerify = computed(
  () => code.value.length === CODE_LENGTH && !verifying.value && (!requirements.value.askPrivacyConsent || acceptPrivacy.value)
);
const isEmail = computed(() => identifier.value.includes("@"));

async function sendCode() {
  sending.value = true;
  error.value = "";
  try {
    requirements.value = await requestCode(identifier.value);
    acceptPrivacy.value = false;
    subscribeNewsletter.value = false;
    digits.value = Array(CODE_LENGTH).fill("");
    step.value = "code";
    await nextTick();
    boxes[0]?.focus();
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo enviar el código";
  } finally {
    sending.value = false;
  }
}

// Reparte los digitos de `text` a partir de la casilla `from` y deja el foco en la siguiente libre.
function fillFrom(from: number, text: string) {
  const chars = text.replace(/\D/g, "").slice(0, CODE_LENGTH - from).split("");
  if (!chars.length) return;
  const next = [...digits.value];
  chars.forEach((c, k) => (next[from + k] = c));
  digits.value = next;
  boxes[Math.min(from + chars.length, CODE_LENGTH - 1)]?.focus();
}

function onDigitInput(i: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, "");
  if (!value) {
    digits.value[i] = "";
    input.value = "";
    return;
  }
  // El codigo entero de golpe (autocompletado del movil): se reparte desde la primera casilla.
  if (value.length >= CODE_LENGTH) {
    input.value = digits.value[i];
    fillFrom(0, value);
    return;
  }
  // Un digito escrito sobre el que ya habia: se queda el nuevo.
  const typed = value.length > 1 ? value.replace(digits.value[i], "").slice(-1) || value.slice(-1) : value;
  digits.value[i] = typed;
  input.value = typed;
  if (i < CODE_LENGTH - 1) boxes[i + 1]?.focus();
}

function onDigitKeydown(i: number, event: KeyboardEvent) {
  if (event.key === "Backspace" && !digits.value[i] && i > 0) {
    event.preventDefault();
    digits.value[i - 1] = "";
    boxes[i - 1]?.focus();
  } else if (event.key === "ArrowLeft" && i > 0) {
    event.preventDefault();
    boxes[i - 1]?.focus();
  } else if (event.key === "ArrowRight" && i < CODE_LENGTH - 1) {
    event.preventDefault();
    boxes[i + 1]?.focus();
  } else if (event.key === "Enter" && canVerify.value) {
    verify();
  }
}

function onPaste(i: number, event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") ?? "";
  fillFrom(text.replace(/\D/g, "").length >= CODE_LENGTH ? 0 : i, text);
}

async function verify() {
  verifying.value = true;
  error.value = "";
  try {
    await verifyCode(
      identifier.value,
      code.value,
      name.value || undefined,
      acceptPrivacy.value || undefined,
      (requirements.value.askName && isEmail.value && subscribeNewsletter.value) || undefined
    );
    emit("logged-in");
  } catch (err: any) {
    error.value = err?.message ?? "Código incorrecto";
  } finally {
    verifying.value = false;
  }
}
</script>

<style scoped>
.login-inline { display: flex; flex-direction: column; gap: 8px; max-width: 320px; }
.code-boxes { display: flex; gap: 8px; }
.code-boxes input {
  flex: 1 1 0;
  min-width: 0;
  height: 52px;
  padding: 0;
  text-align: center;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
.consent { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; font-size: 13px; line-height: 1.45; }
.consent input { margin-top: 3px; flex-shrink: 0; width: auto; display: inline-flex;}
.consent a { color: inherit; text-decoration: underline; }
</style>
