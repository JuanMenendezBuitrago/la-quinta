<template>
  <!-- Por secciones: en pantalla ancha apaisada, la lista a la izquierda y la seccion elegida a la
       derecha; en movil y vertical, pestañas fijas arriba. Un solo "Guardar" para todo. -->
  <section class="settings-admin wide-head">
    <p class="muted">Configuración de la web y del panel. Los cambios de todas las secciones se guardan juntos.</p>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <template v-if="settings">
      <MobileTabs v-model="activeSection" :tabs="[...SECTIONS]" label="Secciones de la configuración" class="settings-tabs" />

      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Secciones de la configuración">
          <button
            v-for="section in SECTIONS"
            :key="section.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSection === section.id }"
            :aria-current="activeSection === section.id ? 'true' : undefined"
            @click="activeSection = section.id"
          >
            <component :is="section.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ section.label }}</span>
          </button>
        </nav>

        <!-- v-if y no v-show: los campos obligatorios de una seccion oculta no deben bloquear el envio -->
        <form class="card settings-form" @submit.prevent="submit">
          <header class="section-head">
            <h2>{{ current.label }}</h2>
            <p class="muted">{{ current.description }}</p>
          </header>

          <template v-if="activeSection === 'pedidos'">
            <div class="field">
              <label class="toggle-row">
                <input v-model="form.staffOnlyOrders" type="checkbox" />
                <span>Solo el personal puede crear pedidos</span>
              </label>
              <span class="muted">Los clientes seguirán viendo la carta y sus pedidos, pero no podrán añadir productos ni pedir desde la web.</span>
            </div>
            <div class="field">
              <label class="toggle-row">
                <input v-model="form.orderQueueEnabled" type="checkbox" />
                <span>Cola de pedidos activa</span>
              </label>
              <span class="muted">Desactivada, los pedidos se hacen y se pagan en caja en el mismo momento: desaparecen la sección «Cola» y el botón «Hacer pedido» (solo queda «Guardar y pagar»), y los clientes no pueden pedir desde la web. Para desactivarla, la cola tiene que estar vacía.</span>
            </div>
            <label class="field">
              <span class="field-label">Recargo por empaque (COP)</span>
              <input v-model.number="form.packagingFeeCents" class="short" type="number" min="0" max="100000" step="1" inputmode="numeric" required />
              <span class="muted">Se suma una vez a cada pedido para llevar: «Para llevar» en el local y recogida desde la web. En mesa o barra, no. 0 = sin recargo.</span>
            </label>
            <div class="field">
              <label class="toggle-row">
                <input v-model="form.ticketPrintingEnabled" type="checkbox" />
                <span>Imprimir tickets en la impresora térmica</span>
              </label>
              <span class="muted">Añade «Imprimir ticket» a los pedidos de la cola y del historial. Imprime desde la tablet Android con la app RawBT instalada y configurada con la IP de la impresora (puerto 9100).</span>
            </div>
          </template>

          <template v-else-if="activeSection === 'fidelizacion'">
            <label class="field">
              <span class="field-label">Sellos para canjear</span>
              <input v-model.number="form.rewardThresholdStamps" class="short" type="number" min="1" max="50" step="1" inputmode="numeric" required />
              <span class="muted">Los que necesita un cliente para llevarse un producto gratis; al canjearlo se le restan. Cambiarlo no toca los sellos que ya tienen los clientes ni los canjes ya hechos.</span>
            </label>
          </template>

          <template v-else-if="activeSection === 'local'">
            <label class="field">
              <span class="field-label">Dirección</span>
              <textarea v-model="form.address" rows="2" placeholder="Calle 00 # 00-00&#10;Barrio, Ciudad"></textarea>
            </label>
            <label class="field">
              <span class="field-label">Enlace «Cómo llegar» (Google Maps u otro)</span>
              <input v-model="form.addressMapUrl" type="url" placeholder="https://maps.google.com/…" />
              <span class="muted">Vacío = no se muestra ese enlace.</span>
            </label>
            <div class="field">
              <span class="field-label">Horario</span>
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
          </template>

          <template v-else-if="activeSection === 'contacto'">
            <label class="field">
              <span class="field-label">Teléfono</span>
              <input v-model="form.phone" type="tel" placeholder="+57 300 000 0000" />
            </label>
            <label class="field">
              <span class="field-label">Email de contacto</span>
              <input v-model="form.email" type="email" placeholder="hola@laquinta.example" />
            </label>
            <div class="field">
              <span class="field-label">Redes sociales</span>
              <span class="muted">Vacío = no se muestra ese icono.</span>
              <div v-for="social in SOCIAL_FIELDS" :key="social.key" class="social-row">
                <span class="social-label">{{ social.label }}</span>
                <input v-model="form[social.key]" type="url" :placeholder="social.placeholder" :aria-label="social.label" />
                <button
                  class="button secondary delete"
                  type="button"
                  :disabled="!form[social.key]"
                  @click="form[social.key] = ''"
                >
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                  Borrar
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'privacidad'">
            <label class="field">
              <span class="field-label">Razón social o nombre del titular</span>
              <input v-model="form.legalName" type="text" />
            </label>
            <label class="field">
              <span class="field-label">NIT o cédula</span>
              <input v-model="form.taxId" type="text" />
            </label>
            <label class="field">
              <span class="field-label">Email para solicitudes sobre datos</span>
              <input v-model="form.privacyEmail" type="email" placeholder="Si está vacío, el email de contacto" />
            </label>
          </template>

          <template v-else-if="activeSection === 'panel'">
            <div class="field">
              <label class="toggle-row">
                <input v-model="form.showInactiveStaff" type="checkbox" />
                <span>Mostrar cuentas de staff desactivadas en el listado</span>
              </label>
              <span class="muted">En la sección «Personal». Ocultas, para reactivar una cuenta hay que volver a marcar esta opción.</span>
            </div>
          </template>

          <footer class="form-actions">
            <button class="button" type="submit" :disabled="saving">{{ saving ? "Guardando…" : "Guardar cambios" }}</button>
            <span v-if="saved" class="muted saved" role="status">Guardado ✓</span>
          </footer>
          <p v-if="formError" class="muted" style="color: var(--danger); margin: 0" role="alert">{{ formError }}</p>
        </form>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ClipboardList, Contact, MapPin, PanelsTopLeft, ShieldCheck, Stamp, Trash2 } from "lucide-vue-next";
import MobileTabs from "~/components/MobileTabs.vue";
import {
  SITE_SETTINGS_QUERY,
  UPDATE_SITE_SETTINGS,
  type OpeningHours,
  type SiteSettings,
} from "~/composables/useSiteSettings";

const SECTIONS = [
  { id: "pedidos", label: "Pedidos", icon: ClipboardList, description: "Quién puede pedir, la cola, el recargo para llevar y los tickets." },
  { id: "fidelizacion", label: "Fidelización", icon: Stamp, description: "La tarjeta de sellos de los clientes." },
  { id: "local", label: "Local", icon: MapPin, description: "Dirección y horario: salen en el pie de página y limitan las horas de recogida." },
  { id: "contacto", label: "Contacto", icon: Contact, description: "Teléfono, email y redes sociales del pie de página." },
  { id: "privacidad", label: "Privacidad", icon: ShieldCheck, description: "Responsable del tratamiento de datos: aparece en la política de privacidad, y la ley exige identificarlo." },
  { id: "panel", label: "Panel", icon: PanelsTopLeft, description: "Opciones del panel del personal." },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const activeSection = ref<SectionId>("pedidos");
const current = computed(() => SECTIONS.find((s) => s.id === activeSection.value) ?? SECTIONS[0]);

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
    orderQueueEnabled: true,
    showInactiveStaff: true,
    packagingFeeCents: 0 as number | "",
    ticketPrintingEnabled: false,
    rewardThresholdStamps: 10 as number | "",
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
      orderQueueEnabled: val.orderQueueEnabled,
      showInactiveStaff: val.showInactiveStaff,
      packagingFeeCents: val.packagingFeeCents,
      ticketPrintingEnabled: val.ticketPrintingEnabled,
      rewardThresholdStamps: val.rewardThresholdStamps,
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
        orderQueueEnabled: form.orderQueueEnabled,
        showInactiveStaff: form.showInactiveStaff,
        packagingFeeCents: Math.round(Number(form.packagingFeeCents) || 0),
        ticketPrintingEnabled: form.ticketPrintingEnabled,
        rewardThresholdStamps: Math.round(Number(form.rewardThresholdStamps) || 0),
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
.settings-tabs { margin-bottom: 16px; }
.settings-layout { display: flex; flex-direction: column; gap: 16px; margin-top: 12px; }
.settings-nav { display: none; }
.settings-form { display: flex; flex-direction: column; gap: 18px; max-width: 560px; min-width: 0; }

@media (min-width: 1000px) and (orientation: landscape) {
  .settings-layout { display: grid; grid-template-columns: 220px minmax(0, 640px); gap: 24px; align-items: start; }
  .settings-form { max-width: none; }
  .settings-nav { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 96px; }
}
.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.settings-nav-item:hover { background: var(--surface-alt); color: var(--text); }
.settings-nav-item.active { background: var(--surface-alt); color: var(--accent-strong); }
.settings-nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.section-head { display: flex; flex-direction: column; gap: 4px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.section-head h2 { margin: 0; font-family: var(--font-futura-text); font-size: 20px; }
.section-head p { margin: 0; font-size: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 14px; font-weight: 600; }
.field .muted { font-size: 13.5px; }
.toggle-row { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
.toggle-row input { width: auto; margin: 3px 0 0; flex-shrink: 0; }
input.short { max-width: 12rem; }

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
.social-row { grid-template-columns: 90px minmax(0, 1fr) auto; }
.social-label { font-size: 13px; font-weight: 600; color: var(--text); }

.form-actions { display: flex; align-items: center; gap: 12px; padding-top: 14px; border-top: 1px solid var(--border); }
.saved { color: var(--accent-strong); }

textarea, input[type="text"], input[type="url"], input[type="tel"], input[type="email"], input[type="time"], input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
