<template>
  <form class="review-form" @submit.prevent="save">
    <StarRating v-model="rating" :label="orderId ? 'Puntuación del pedido' : 'Puntuación de La Quinta'" />
    <label class="sr-only" :for="`${uid}-comment`">Comentario (opcional)</label>
    <textarea
      :id="`${uid}-comment`"
      v-model="comment"
      rows="3"
      :maxlength="COMMENT_MAX"
      :placeholder="orderId ? '¿Qué tal estaba? (opcional)' : 'Cuéntanos tu experiencia (opcional)'"
    />
    <div class="actions">
      <button class="button" type="submit" :disabled="!rating || saving || !changed">
        {{ saving ? "Guardando…" : existing ? "Guardar cambios" : "Enviar opinión" }}
      </button>
      <button v-if="cancellable" class="button secondary" type="button" :disabled="saving" @click="emit('cancel')">Cerrar</button>
      <span v-if="saved" class="muted ok" role="status">¡Gracias! ✓</span>
    </div>
    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
  </form>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import StarRating from "~/components/StarRating.vue";

export interface MyReview {
  id: string;
  orderId: string | null;
  rating: number;
  comment: string | null;
}

const COMMENT_MAX = 1000;

const SUBMIT_REVIEW = gql`
  mutation SubmitReview($orderId: ID, $rating: Int!, $comment: String) {
    submitReview(orderId: $orderId, rating: $rating, comment: $comment) {
      id
      orderId
      orderCode
      rating
      comment
      createdAt
      updatedAt
    }
  }
`;

const props = defineProps<{ orderId?: string | null; existing?: MyReview | null; cancellable?: boolean }>();
const emit = defineEmits<{ (e: "saved", review: MyReview): void; (e: "cancel"): void }>();

const uid = useId();
const rating = ref(props.existing?.rating ?? 0);
const comment = ref(props.existing?.comment ?? "");
const changed = computed(
  () => rating.value !== (props.existing?.rating ?? 0) || comment.value.trim() !== (props.existing?.comment ?? "")
);

const { mutate } = useMutation(SUBMIT_REVIEW);
const saving = ref(false);
const saved = ref(false);
const error = ref("");

async function save() {
  if (!rating.value) return;
  saving.value = true;
  error.value = "";
  try {
    const result = await mutate({ orderId: props.orderId ?? null, rating: rating.value, comment: comment.value.trim() || null });
    const review = result?.data?.submitReview;
    if (review) emit("saved", review);
    saved.value = true;
    setTimeout(() => (saved.value = false), 3000);
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar la opinión";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.review-form { display: flex; flex-direction: column; gap: 10px; }
textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
}
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ok { color: var(--accent-strong); }
.error { color: var(--danger); margin: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
