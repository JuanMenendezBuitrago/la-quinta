<template>
  <section class="settings-admin">
    <h2>Pie de página</h2>
    <p class="muted">Estos datos se muestran en el pie de página de toda la web.</p>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <form v-if="settings" class="card settings-form" @submit.prevent="submit">
      <label class="field">
        <span class="muted">Dirección</span>
        <textarea v-model="form.address" rows="2" placeholder="Calle 00 # 00-00&#10;Barrio, Ciudad"></textarea>
      </label>

      <label class="field">
        <span class="muted">Enlace "Cómo llegar" (Google Maps u otro)</span>
        <input v-model="form.addressMapUrl" type="url" placeholder="https://maps.google.com/…" />
        <span class="muted">Vacío = no se muestra ese enlace.</span>
      </label>

      <div class="field">
        <span class="muted">Horario</span>
        <div v-for="(line, i) in form.schedule" :key="i" class="schedule-row">
          <input v-model="line.label" type="text" placeholder="Días (ej. Lun – Vie)" />
          <input v-model="line.hours" type="text" placeholder="Horas (ej. 7:00 – 19:00)" />
          <button class="button secondary" type="button" aria-label="Quitar esta línea" @click="form.schedule.splice(i, 1)">✕</button>
        </div>
        <button class="button secondary" type="button" @click="form.schedule.push({ label: '', hours: '' })">
          + Añadir línea
        </button>
      </div>

      <label class="field">
        <span class="muted">Teléfono</span>
        <input v-model="form.phone" type="tel" placeholder="+57 300 000 0000" />
      </label>

      <label class="field">
        <span class="muted">Email de contacto</span>
        <input v-model="form.email" type="email" placeholder="hola@laquinta.example" />
      </label>

      <div class="field">
        <span class="muted">Redes sociales — vacío = no se muestra ese icono</span>
        <div v-for="social in SOCIAL_FIELDS" :key="social.key" class="social-row">
          <span class="social-label">{{ social.label }}</span>
          <input v-model="form[social.key]" type="url" :placeholder="social.placeholder" />
          <button
            class="button secondary"
            type="button"
            :disabled="!form[social.key]"
            @click="form[social.key] = ''"
          >
            Borrar
          </button>
        </div>
      </div>

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>
      <p v-if="saved" class="muted" style="color: var(--accent-strong)">Guardado ✓</p>

      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">{{ saving ? "Guardando…" : "Guardar cambios" }}</button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { SITE_SETTINGS_QUERY, UPDATE_SITE_SETTINGS, type SiteSettings } from "~/composables/useSiteSettings";

const SOCIAL_FIELDS = [
  { key: "socialInstagram" as const, label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "socialFacebook" as const, label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "socialTiktok" as const, label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { key: "socialWhatsapp" as const, label: "WhatsApp", placeholder: "https://wa.me/57300…" },
];

const { result, loading, error, refetch } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const settings = computed(() => result.value?.siteSettings ?? null);
const loadError = computed(() => (error.value ? "No se pudo cargar la configuración." : ""));

function emptyForm() {
  return {
    address: "",
    addressMapUrl: "",
    schedule: [] as { label: string; hours: string }[],
    phone: "",
    email: "",
    socialInstagram: "",
    socialFacebook: "",
    socialTiktok: "",
    socialWhatsapp: "",
  };
}

const form = reactive(emptyForm());

// Rellena el formulario en cuanto llegan los datos (y si se recargan tras guardar).
watch(
  settings,
  (val) => {
    if (!val) return;
    Object.assign(form, {
      address: val.address ?? "",
      addressMapUrl: val.addressMapUrl ?? "",
      schedule: val.schedule.map((l) => ({ ...l })),
      phone: val.phone ?? "",
      email: val.email ?? "",
      socialInstagram: val.socialInstagram ?? "",
      socialFacebook: val.socialFacebook ?? "",
      socialTiktok: val.socialTiktok ?? "",
      socialWhatsapp: val.socialWhatsapp ?? "",
    });
  },
  { immediate: true }
);

const saving = ref(false);
const formError = ref("");
const saved = ref(false);
let savedTimeout: ReturnType<typeof setTimeout> | null = null;

async function submit() {
  saving.value = true;
  formError.value = "";
  saved.value = false;
  try {
    const { mutate } = useMutation(UPDATE_SITE_SETTINGS);
    await mutate({
      input: {
        address: form.address.trim() || null,
        addressMapUrl: form.addressMapUrl.trim() || null,
        schedule: form.schedule
          .map((l) => ({ label: l.label.trim(), hours: l.hours.trim() }))
          .filter((l) => l.label && l.hours),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        socialInstagram: form.socialInstagram.trim() || null,
        socialFacebook: form.socialFacebook.trim() || null,
        socialTiktok: form.socialTiktok.trim() || null,
        socialWhatsapp: form.socialWhatsapp.trim() || null,
      },
    });
    await refetch();
    saved.value = true;
    if (savedTimeout) clearTimeout(savedTimeout);
    savedTimeout = setTimeout(() => (saved.value = false), 2000);
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar";
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  if (savedTimeout) clearTimeout(savedTimeout);
});
</script>

<style scoped>
.settings-admin { max-width: 480px; }
.settings-form { margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }

.schedule-row, .social-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.social-row { grid-template-columns: 90px 1fr auto; }
.social-label { font-size: 13px; font-weight: 600; color: var(--text); }

.form-actions { margin-top: 4px; }

textarea, input[type="text"], input[type="url"], input[type="tel"], input[type="email"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}
</style>
