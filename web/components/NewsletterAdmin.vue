<template>
  <section class="newsletter-admin">
    <p class="muted intro">
      <strong>{{ overview?.subscriberCount ?? "…" }}</strong>
      {{ overview?.subscriberCount === 1 ? "cliente ha" : "clientes han" }} autorizado recibir novedades por email.
      Solo les llega a ellos, y cada correo lleva su enlace para darse de baja.
    </p>

    <form class="card newsletter-form" @submit.prevent>
      <label class="field">
        <span class="muted">Asunto</span>
        <input v-model="subject" type="text" maxlength="150" placeholder="Ej. Este sábado, taller de cata" />
      </label>
      <label class="field">
        <span class="muted">Mensaje</span>
        <textarea
          v-model="body"
          rows="9"
          maxlength="10000"
          placeholder="Escribe el texto tal cual. Deja una línea en blanco para separar párrafos."
        />
      </label>

      <p v-if="error" class="muted" style="color: var(--danger)">{{ error }}</p>
      <p v-if="notice" class="muted ok">{{ notice }}</p>

      <!-- Confirmacion antes de mandar a todos: "Volver" queda en el sitio del boton principal -->
      <div v-if="confirming" class="send-confirm" role="alert">
        <p>
          <strong>¿Enviar «{{ subject.trim() }}» a {{ overview?.subscriberCount }} {{ overview?.subscriberCount === 1 ? "cliente" : "clientes" }}?</strong>
          No se puede deshacer.
        </p>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="busy" @click="confirming = false">Volver</button>
          <button class="button" type="button" :disabled="busy" @click="sendAll">
            {{ busy ? "Enviando…" : "Sí, enviar" }}
          </button>
        </div>
      </div>
      <div v-else class="form-actions">
        <button class="button secondary" type="button" :disabled="busy || !canSend" @click="sendTest">
          <Mail :size="16" :stroke-width="1.8" />
          {{ busy ? "Enviando…" : "Enviarme una prueba" }}
        </button>
        <button
          class="button"
          type="button"
          :disabled="busy || !canSend || !overview?.subscriberCount || sending"
          @click="confirming = true"
        >
          <Send :size="16" :stroke-width="1.8" />
          Enviar a los suscriptores
        </button>
      </div>
      <p v-if="sending" class="muted">Hay un envío en curso: podrás mandar otro cuando termine.</p>
    </form>

    <h2 class="history-title">Envíos</h2>
    <p v-if="!overview?.campaigns.length" class="muted">Todavía no se ha enviado ninguno.</p>
    <article v-for="c in overview?.campaigns ?? []" :key="c.id" class="card campaign">
      <div class="campaign-head">
        <strong>{{ c.subject }}</strong>
        <span class="campaign-status" :class="`status-${c.status}`">{{ STATUS_LABELS[c.status] }}</span>
      </div>
      <p class="muted">
        {{ formatDateTime(c.createdAt) }}<template v-if="c.createdByName"> · {{ c.createdByName }}</template> ·
        {{ c.sentCount }} de {{ c.recipients }} enviados<template v-if="c.failedCount"> · {{ c.failedCount }} fallidos</template>
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Mail, Send } from "lucide-vue-next";

const OVERVIEW = gql`
  query NewsletterOverview {
    newsletterOverview {
      subscriberCount
      campaigns {
        id
        subject
        status
        recipients
        sentCount
        failedCount
        createdByName
        createdAt
      }
    }
  }
`;
const SEND_TEST = gql`
  mutation SendNewsletterTest($subject: String!, $body: String!) {
    sendNewsletterTest(subject: $subject, body: $body)
  }
`;
const SEND = gql`
  mutation SendNewsletter($subject: String!, $body: String!) {
    sendNewsletter(subject: $subject, body: $body) {
      id
    }
  }
`;

const STATUS_LABELS: Record<string, string> = {
  ENVIANDO: "Enviando…",
  ENVIADA: "Enviada",
  INTERRUMPIDA: "Interrumpida",
};

const { result, refetch } = useQuery(OVERVIEW, null, { fetchPolicy: "cache-and-network" });
const overview = computed(() => result.value?.newsletterOverview);
const sending = computed(() => !!overview.value?.campaigns.some((c: any) => c.status === "ENVIANDO"));

// Mientras hay un envio en curso, el progreso se refresca solo.
let timer: ReturnType<typeof setInterval> | null = null;
watch(
  sending,
  (active) => {
    if (active && !timer) timer = setInterval(() => refetch(), 4000);
    if (!active && timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => timer && clearInterval(timer));

const subject = ref("");
const body = ref("");
const canSend = computed(() => subject.value.trim() !== "" && body.value.trim() !== "");
const busy = ref(false);
const confirming = ref(false);
const error = ref("");
const notice = ref("");

const { mutate: sendTestMutation } = useMutation(SEND_TEST);
const { mutate: sendMutation } = useMutation(SEND);

async function sendTest() {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await sendTestMutation({ subject: subject.value, body: body.value });
    notice.value = "Te hemos enviado la prueba a tu email ✓";
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo enviar la prueba";
  } finally {
    busy.value = false;
  }
}

async function sendAll() {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await sendMutation({ subject: subject.value, body: body.value });
    notice.value = "Envío en marcha. Puedes seguir el progreso abajo.";
    subject.value = "";
    body.value = "";
    confirming.value = false;
    await refetch();
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo empezar el envío";
  } finally {
    busy.value = false;
  }
}

const { formatDateTime } = useStoreTime();
</script>

<style scoped>
.intro { margin: 0 0 16px; }
.newsletter-form { display: flex; flex-direction: column; gap: 12px; max-width: 620px; }
.field { display: flex; flex-direction: column; gap: 4px; }
textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
}
.form-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.form-actions .button { display: inline-flex; align-items: center; gap: 8px; }
.ok { color: var(--accent-strong); }
.send-confirm {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.send-confirm p { margin: 0 0 10px; font-size: 14px; }

.history-title { margin: 32px 0 6px; }
.campaign { margin-top: 10px; max-width: 620px; }
.campaign p { margin: 4px 0 0; font-size: 13px; }
.campaign-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.campaign-status {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--accent-strong);
  color: var(--bg);
}
.campaign-status.status-ENVIANDO { background: var(--color5); }
.campaign-status.status-INTERRUMPIDA { background: var(--danger); }
</style>
