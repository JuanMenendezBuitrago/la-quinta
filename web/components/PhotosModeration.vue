<template>
  <!-- Fotos que envian los clientes de lo que pidieron: se aprueban (salen en la ficha del producto
       y suman un sello al cliente) o se rechazan (se borra la foto). Solo gestion. -->
  <section class="photos-moderation">
    <div class="filters" role="group" aria-label="Estado de las fotos">
      <button
        v-for="s in STATUSES"
        :key="s.id"
        type="button"
        class="chip"
        :class="{ active: status === s.id }"
        :aria-pressed="status === s.id"
        @click="status = s.id"
      >
        {{ s.label }}<template v-if="s.id === 'PENDIENTE' && pendingCount"> ({{ pendingCount }})</template>
      </button>
    </div>
    <p class="muted intro">
      Al aprobar una foto sale en la ficha del producto con el nombre e inicial del cliente («Foto de Ana T.»), y el cliente
      suma un sello (uno por producto y pedido). Rechazarla la borra. No publiques fotos en las que se reconozca a otras personas.
    </p>

    <p v-if="message" class="muted notice" :class="{ error: messageIsError }" role="status">{{ message }}</p>
    <p v-if="loading && !photos.length" class="muted">Cargando…</p>
    <EmptyState v-else-if="!photos.length" :icon="Camera" :title="EMPTY_TITLES[status]" />

    <div class="photo-grid">
      <article v-for="p in photos" :key="p.id" class="card photo-card">
        <a v-if="p.url" :href="resolveImageUrl(p.url) ?? ''" target="_blank" rel="noopener" class="photo-link" title="Ver a tamaño completo">
          <img :src="resolveImageUrl(p.url) ?? ''" :alt="`Foto de ${p.menuItemName}`" loading="lazy" />
        </a>
        <div class="photo-info">
          <strong>{{ p.menuItemName }}</strong>
          <span class="muted">{{ p.customerName }}{{ p.customerCode ? ` · ${p.customerCode}` : "" }}{{ p.orderCode ? ` · ${p.orderCode}` : "" }}</span>
          <span class="muted">{{ formatDateTime(p.createdAt) }}</span>
          <span v-if="p.usedAsMain" class="tag">Foto principal del producto</span>
          <span v-if="p.status !== 'PENDIENTE' && p.reviewedByName" class="muted">
            {{ p.status === "APROBADA" ? "Aprobada" : "Rechazada" }} por {{ p.reviewedByName }}{{ p.rejectReason ? `: ${p.rejectReason}` : "" }}
          </span>
        </div>

        <!-- Motivo del rechazo (opcional), antes de confirmar -->
        <div v-if="rejectingId === p.id" class="reject-box">
          <input v-model="rejectReason" type="text" maxlength="200" placeholder="Motivo (opcional), lo verá el cliente" aria-label="Motivo del rechazo" />
          <div class="actions">
            <button class="button danger-solid" type="button" :disabled="busyId === p.id" @click="moderate(p, false)">Rechazar</button>
            <button class="button secondary" type="button" :disabled="busyId === p.id" @click="rejectingId = ''">Volver</button>
          </div>
        </div>
        <div v-else class="actions">
          <template v-if="p.status === 'PENDIENTE'">
            <button class="button" type="button" :disabled="busyId === p.id" @click="moderate(p, true)">Aprobar</button>
            <button class="button secondary" type="button" :disabled="busyId === p.id" @click="moderate(p, true, true)">Aprobar y usar como principal</button>
          </template>
          <button v-else-if="p.status === 'APROBADA' && !p.usedAsMain" class="button secondary" type="button" :disabled="busyId === p.id" @click="moderate(p, true, true)">
            Usar como principal
          </button>
          <button v-if="p.status !== 'RECHAZADA'" class="button secondary cancel" type="button" :disabled="busyId === p.id" @click="startReject(p)">
            {{ p.status === "APROBADA" ? "Retirar de la carta" : "Rechazar" }}
          </button>
        </div>
      </article>
    </div>

    <button v-if="photos.length < total" class="button secondary more" type="button" :disabled="loading" @click="loadMore">Ver más</button>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { Camera } from "lucide-vue-next";
import EmptyState from "~/components/EmptyState.vue";
import { useImageUrl } from "~/composables/useImageUrl";
import { usePendingPhotosCount } from "~/composables/useStaffSections";

type PhotoStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA";
interface StaffPhoto {
  id: string;
  url: string | null;
  menuItemName: string;
  orderCode: string | null;
  customerName: string;
  customerCode: string | null;
  status: PhotoStatus;
  rejectReason: string | null;
  usedAsMain: boolean;
  reviewedByName: string | null;
  createdAt: string;
}

const STATUSES: { id: PhotoStatus; label: string }[] = [
  { id: "PENDIENTE", label: "Pendientes" },
  { id: "APROBADA", label: "Aprobadas" },
  { id: "RECHAZADA", label: "Rechazadas" },
];
const EMPTY_TITLES: Record<PhotoStatus, string> = {
  PENDIENTE: "No hay fotos pendientes de revisar",
  APROBADA: "Todavía no hay fotos aprobadas",
  RECHAZADA: "No hay fotos rechazadas",
};
const PAGE_SIZE = 24;
const PHOTO_FIELDS = `id url menuItemName orderCode customerName customerCode status rejectReason usedAsMain reviewedByName createdAt`;

const PHOTOS_QUERY = gql`
  query ProductPhotosForReview($status: ProductPhotoStatus!, $limit: Int, $offset: Int) {
    productPhotosForReview(status: $status, limit: $limit, offset: $offset) { total items { ${PHOTO_FIELDS} } }
    pendingProductPhotosCount
  }
`;
const MODERATE = gql`
  mutation ModerateProductPhoto($id: ID!, $approve: Boolean!, $reason: String, $setAsMain: Boolean) {
    moderateProductPhoto(id: $id, approve: $approve, reason: $reason, setAsMain: $setAsMain) { ${PHOTO_FIELDS} }
  }
`;

const { resolveImageUrl } = useImageUrl();
const { formatDateTime } = useStoreTime();
const status = ref<PhotoStatus>("PENDIENTE");
const photos = ref<StaffPhoto[]>([]);
const total = ref(0);
// Compartido con el contador del menu del panel (lo actualiza tambien al moderar).
const pendingCount = usePendingPhotosCount();
const loading = ref(false);
const busyId = ref("");
const rejectingId = ref("");
const rejectReason = ref("");
const message = ref("");
const messageIsError = ref(false);

async function load(append = false) {
  loading.value = true;
  try {
    const { data } = await useNuxtApp().$apollo.defaultClient.query({
      query: PHOTOS_QUERY,
      variables: { status: status.value, limit: PAGE_SIZE, offset: append ? photos.value.length : 0 },
      fetchPolicy: "network-only",
    });
    const page = data.productPhotosForReview;
    photos.value = append ? [...photos.value, ...page.items] : page.items;
    total.value = page.total;
    pendingCount.value = data.pendingProductPhotosCount;
  } catch (err: any) {
    message.value = err?.message ?? "No se pudieron cargar las fotos";
    messageIsError.value = true;
  } finally {
    loading.value = false;
  }
}
function loadMore() {
  load(true);
}
watch(status, () => {
  message.value = "";
  rejectingId.value = "";
  load();
});
onMounted(() => load());

function startReject(p: StaffPhoto) {
  rejectingId.value = p.id;
  rejectReason.value = "";
}

async function moderate(p: StaffPhoto, approve: boolean, setAsMain = false) {
  busyId.value = p.id;
  message.value = "";
  try {
    const { mutate } = useMutation(MODERATE);
    await mutate({ id: p.id, approve, reason: approve ? null : rejectReason.value.trim() || null, setAsMain });
    message.value = !approve
      ? `Foto de ${p.menuItemName} ${p.status === "APROBADA" ? "retirada de la carta" : "rechazada"}.`
      : setAsMain
        ? `Foto aprobada y puesta como foto principal de ${p.menuItemName}.`
        : `Foto de ${p.menuItemName} aprobada.`;
    messageIsError.value = false;
    rejectingId.value = "";
    await load();
  } catch (err: any) {
    message.value = err?.message ?? "No se pudo guardar";
    messageIsError.value = true;
  } finally {
    busyId.value = "";
  }
}
</script>

<style scoped>
.photos-moderation { display: flex; flex-direction: column; gap: 14px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }
/* Como los filtros de Opiniones (ReviewsAdmin.vue) */
.chip {
  border: 1px solid var(--field-border);
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.chip.active { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
.intro, .notice { margin: 0; }
.notice { color: var(--accent); }
.notice.error { color: var(--danger); }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.photo-card { display: flex; flex-direction: column; gap: 10px; }
.photo-link img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; background: var(--surface-alt); }
.photo-info { display: flex; flex-direction: column; gap: 2px; font-size: 14px; min-width: 0; overflow-wrap: anywhere; }
.tag { align-self: flex-start; margin-top: 4px; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--on-accent-soft); font-size: 12px; font-weight: 600; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.reject-box { display: flex; flex-direction: column; gap: 8px; }
.more { align-self: center; }
</style>
