<template>
  <!-- Foto de un producto de un pedido entregado. Se reduce en el movil (y pierde el EXIF) antes de
       subirla; queda pendiente hasta que el local la revise. Emite sent al enviarla y cancel. -->
  <form class="photo-upload" @submit.prevent="send">
    <fieldset v-if="products.length > 1" class="photo-products">
      <legend class="muted">¿De qué producto es la foto?</legend>
      <label v-for="p in products" :key="p.menuItemId" class="photo-product" :class="{ active: menuItemId === p.menuItemId }">
        <input v-model="menuItemId" type="radio" name="photo-product" :value="p.menuItemId" />
        {{ p.name }}
      </label>
    </fieldset>
    <p v-else class="muted">Foto de <strong>{{ products[0]?.name }}</strong></p>

    <label class="photo-pick">
      <input type="file" accept="image/*" capture="environment" @change="onFile" />
      <img v-if="previewUrl" :src="previewUrl" alt="Vista previa de la foto" class="photo-preview" />
      <span v-else class="photo-placeholder">
        <Camera :size="22" :stroke-width="1.8" aria-hidden="true" />
        Hacer o elegir una foto
      </span>
    </label>

    <label class="photo-consent">
      <input v-model="consent" type="checkbox" />
      <span>
        Autorizo a La Quinta a publicar esta foto en su carta, con mi nombre y la inicial de mi apellido.
        Puedo retirarla cuando quiera desde «Mis fotos».
      </span>
    </label>

    <p v-if="error" class="muted photo-error" role="alert">{{ error }}</p>
    <div class="photo-actions">
      <button class="button" type="submit" :disabled="sending || !photo || !consent || !menuItemId">
        {{ sending ? "Enviando…" : "Enviar foto" }}
      </button>
      <button class="button secondary" type="button" :disabled="sending" @click="emit('cancel')">Cancelar</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { Camera } from "lucide-vue-next";
import { shrinkImage } from "~/composables/useImageResize";

const props = defineProps<{ orderId: string; items: { menuItemId: string; name: string }[] }>();
const emit = defineEmits<{ sent: []; cancel: [] }>();

const config = useRuntimeConfig();
const token = useCookie("lq_auth_token");

// Un producto por linea, sin repetir (un cafe con dos personalizaciones son dos lineas).
const products = computed(() => [...new Map(props.items.map((i) => [i.menuItemId, i])).values()]);
const menuItemId = ref(products.value.length === 1 ? products.value[0].menuItemId : "");
const photo = ref<Blob | null>(null);
const previewUrl = ref("");
const consent = ref(false);
const sending = ref(false);
const error = ref("");

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = "";
  try {
    photo.value = await shrinkImage(file);
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = URL.createObjectURL(photo.value);
  } catch {
    error.value = "No se pudo leer la foto: prueba con otra";
  }
}
onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value));

async function send() {
  if (!photo.value || !consent.value || !menuItemId.value || sending.value) return;
  sending.value = true;
  error.value = "";
  try {
    const body = new FormData();
    body.append("orderId", props.orderId);
    body.append("menuItemId", menuItemId.value);
    body.append("consent", "true");
    body.append("file", photo.value, "foto.jpg");
    const uploadsBase = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
    const res = await fetch(`${uploadsBase}/uploads/photo`, {
      method: "POST",
      headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la foto");
    emit("sent");
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo enviar la foto";
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.photo-upload { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.photo-upload p { margin: 0; }
.photo-products { border: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.photo-products legend { padding: 0; margin-bottom: 6px; }
.photo-product {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
}
.photo-product.active { border-color: var(--accent); color: var(--accent); }
.photo-product input { margin: 0; accent-color: var(--accent); }
.photo-pick { display: block; cursor: pointer; }
.photo-pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.photo-pick:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 10px; }
.photo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  border: 1px dashed var(--field-border);
  border-radius: 10px;
  color: var(--accent);
  font-weight: 600;
}
.photo-preview { display: block; width: 100%; max-height: 320px; object-fit: contain; border-radius: 10px; background: var(--surface-alt); }
.photo-consent { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
.photo-consent input { width: 18px; height: 18px; margin: 2px 0 0; flex-shrink: 0; accent-color: var(--accent); }
.photo-error { color: var(--danger); }
.photo-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
