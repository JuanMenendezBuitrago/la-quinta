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
      <input v-model="code" type="text" inputmode="numeric" placeholder="Código de 6 dígitos" />
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
      <button
        class="button"
        style="margin-top: 8px"
        :disabled="!code || verifying || (requirements.askPrivacyConsent && !acceptPrivacy)"
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
const code = ref("");
const name = ref("");
const sending = ref(false);
const verifying = ref(false);
const error = ref("");
const requirements = ref<LoginRequirements>({ askName: false, askPrivacyConsent: false });
const acceptPrivacy = ref(false);

async function sendCode() {
  sending.value = true;
  error.value = "";
  try {
    requirements.value = await requestCode(identifier.value);
    acceptPrivacy.value = false;
    step.value = "code";
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo enviar el código";
  } finally {
    sending.value = false;
  }
}

async function verify() {
  verifying.value = true;
  error.value = "";
  try {
    await verifyCode(identifier.value, code.value, name.value || undefined, acceptPrivacy.value || undefined);
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
.consent { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; font-size: 13px; line-height: 1.45; }
.consent input { margin-top: 3px; flex-shrink: 0; }
.consent a { color: inherit; text-decoration: underline; }
</style>
