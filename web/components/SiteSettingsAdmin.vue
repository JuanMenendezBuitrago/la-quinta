<template>
  <section class="settings-admin">
    <p class="muted">Configuración de la web: pedidos de clientes y datos del pie de página.</p>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <form v-if="settings" class="card settings-form" @submit.prevent="submit">
      <div class="field">
        <span class="muted">Pedidos</span>
        <label class="day-toggle">
          <input v-model="form.staffOnlyOrders" type="checkbox" />
          <span>Solo el personal puede crear pedidos</span>
        </label>
        <span class="muted">Los clientes seguirán viendo la carta y sus pedidos, pero no podrán añadir productos ni pedir desde la web.</span>
      </div>

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
        <span class="muted">Los clientes solo pueden elegir recogida dentro de este horario. El pie de página lo muestra agrupando los días iguales.</span>
        <div v-for="day in form.openingHours" :key="day.weekday" class="schedule-row">
          <label class="day-toggle">
            <input v-model="day.isOpen" type="checkbox" />
            <span>{{ WEEKDAY_NAMES[day.weekday] }}</span>
          </label>
          <template v-if="day.isOpen">
            <input v-model="day.open" type="time" required :aria-label="`${WEEKDAY_NAMES[day.weekday]}: abre`" />
            <input v-model="day.close" type="time" required :aria-label="`${WEEKDAY_NAMES[day.weekday]}: cierra`" />
          </template>
          <span v-else class="muted closed-label">Cerrado</span>
        </div>
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

      <div class="field">
        <span class="muted">Responsable del tratamiento de datos</span>
        <span class="muted">Aparecen en la política de privacidad. La ley exige identificar al responsable.</span>
        <input v-model="form.legalName" type="text" placeholder="Razón social o nombre del titular" />
        <input v-model="form.taxId" type="text" placeholder="NIT o cédula" />
        <input v-model="form.privacyEmail" type="email" placeholder="Email para solicitudes sobre datos (si vacío, el de contacto)" />
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
import {
  SITE_SETTINGS_QUERY,
  UPDATE_SITE_SETTINGS,
  type OpeningHours,
  type SiteSettings,
} from "~/composables/useSiteSettings";

const WEEKDAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Siempre los 7 dias en el formulario. Un dia cerrado no guarda horas en la API: si se
// reabre, se le proponen las del dia abierto anterior (lo mas habitual), editables.
function openingHoursForm(hours: OpeningHours[]) {
  let previous = { open: "08:00", close: "18:00" };
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const day = hours.find((h) => h.weekday === weekday);
    if (day) previous = day;
    return { weekday, isOpen: !!day, open: (day ?? previous).open, close: (day ?? previous).close };
  });
}

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
    openingHours: openingHoursForm([]),
    phone: "",
    email: "",
    socialInstagram: "",
    socialFacebook: "",
    socialTiktok: "",
    socialWhatsapp: "",
    legalName: "",
    taxId: "",
    privacyEmail: "",
    staffOnlyOrders: false,
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
      openingHours: openingHoursForm(val.openingHours),
      phone: val.phone ?? "",
      email: val.email ?? "",
      socialInstagram: val.socialInstagram ?? "",
      socialFacebook: val.socialFacebook ?? "",
      socialTiktok: val.socialTiktok ?? "",
      socialWhatsapp: val.socialWhatsapp ?? "",
      legalName: val.legalName ?? "",
      taxId: val.taxId ?? "",
      privacyEmail: val.privacyEmail ?? "",
      staffOnlyOrders: val.staffOnlyOrders,
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
        openingHours: form.openingHours
          .filter((d) => d.isOpen)
          .map(({ weekday, open, close }) => ({ weekday, open, close })),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        socialInstagram: form.socialInstagram.trim() || null,
        socialFacebook: form.socialFacebook.trim() || null,
        socialTiktok: form.socialTiktok.trim() || null,
        socialWhatsapp: form.socialWhatsapp.trim() || null,
        legalName: form.legalName.trim() || null,
        taxId: form.taxId.trim() || null,
        privacyEmail: form.privacyEmail.trim() || null,
        staffOnlyOrders: form.staffOnlyOrders,
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
/* minmax(0, …) + min-width: 0: los input type="time" tienen un ancho minimo intrinseco que,
   si no, desborda la tarjeta en pantallas de movil. */
.schedule-row { grid-template-columns: minmax(0, 7rem) minmax(0, 1fr) minmax(0, 1fr); }
.schedule-row input[type="time"] { min-width: 0; padding: 8px; }
.day-toggle { display: flex; align-items: center; justify-content: flex-start; gap: 8px; font-size: 14px; font-weight: 600; }
.day-toggle input { width: auto; margin: 0; }
.closed-label { grid-column: span 2; }
.social-row { grid-template-columns: 90px 1fr auto; }
.social-label { font-size: 13px; font-weight: 600; color: var(--text); }

.form-actions { margin-top: 4px; }

textarea, input[type="text"], input[type="url"], input[type="tel"], input[type="email"], input[type="time"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
