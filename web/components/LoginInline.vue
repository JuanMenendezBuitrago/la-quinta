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
        v-if="!isExistingCustomer"
        v-model="name"
        type="text"
        placeholder="Tu nombre (solo la primera vez)"
        style="margin-top: 8px"
      />
      <button class="button" style="margin-top: 8px" :disabled="!code || verifying" @click="verify">
        {{ verifying ? "Comprobando…" : "Confirmar" }}
      </button>
    </template>

    <p v-if="error" class="muted" style="color: var(--danger)">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from "~/composables/useAuth";

const emit = defineEmits<{ (e: "logged-in"): void }>();

const { requestCode, verifyCode } = useAuth();
const step = ref<"identifier" | "code">("identifier");
const identifier = ref("");
const code = ref("");
const name = ref("");
const sending = ref(false);
const verifying = ref(false);
const error = ref("");
const isExistingCustomer = ref(false);

async function sendCode() {
  sending.value = true;
  error.value = "";
  try {
    isExistingCustomer.value = await requestCode(identifier.value);
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
    await verifyCode(identifier.value, code.value, name.value || undefined);
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
</style>
