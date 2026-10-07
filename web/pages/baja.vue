<template>
  <main class="container page-unsubscribe">
    <header class="account-hero">
      <p class="eyebrow">Novedades por email</p>
      <h1>{{ title }}</h1>
    </header>
    <div class="card">
      <p v-if="state === 'working'" class="muted">Procesando tu baja…</p>
      <template v-else-if="state === 'done'">
        <p>Ya no recibirás más correos con novedades de La Quinta. Tu cuenta sigue igual.</p>
        <p class="muted">
          Si cambias de opinión, puedes volver a activarlas en <NuxtLink to="/cuenta">Mi cuenta</NuxtLink>.
        </p>
      </template>
      <template v-else>
        <p>{{ errorMessage }}</p>
        <p class="muted">
          También puedes darte de baja en <NuxtLink to="/cuenta">Mi cuenta</NuxtLink>, iniciando sesión.
        </p>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";

// Enlace de los correos de novedades: /baja?u=<id del cliente>&t=<firma>. Funciona sin sesion.
const UNSUBSCRIBE = gql`
  mutation UnsubscribeNewsletter($userId: ID!, $token: String!) {
    unsubscribeNewsletter(userId: $userId, token: $token)
  }
`;

const route = useRoute();
const state = ref<"working" | "done" | "error">("working");
const errorMessage = ref("");
const title = computed(() =>
  state.value === "done" ? "Te has dado de baja" : state.value === "error" ? "No se pudo dar de baja" : "Darse de baja"
);

const { mutate } = useMutation(UNSUBSCRIBE);

onMounted(async () => {
  const userId = typeof route.query.u === "string" ? route.query.u : "";
  const token = typeof route.query.t === "string" ? route.query.t : "";
  if (!userId || !token) {
    state.value = "error";
    errorMessage.value = "El enlace está incompleto.";
    return;
  }
  try {
    await mutate({ userId, token });
    state.value = "done";
  } catch (err: any) {
    state.value = "error";
    errorMessage.value = err?.message ?? "El enlace no es válido.";
  }
});

useHead({ title: "Darse de baja · La Quinta", meta: [{ name: "robots", content: "noindex" }] });
</script>

<style scoped>
.card p { margin: 0 0 10px; }
.card p:last-child { margin-bottom: 0; }
</style>
