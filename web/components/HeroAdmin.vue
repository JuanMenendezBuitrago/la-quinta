<template>
  <section class="hero-admin">
    <div class="hero-admin-header">
      <h2>Portada</h2>
      <button class="button" type="button" :disabled="formOpen" @click="startCreate">+ Nueva diapositiva</button>
    </div>
    <p class="muted intro">
      Ofertas, eventos y novedades que se muestran arriba de la carta. Solo se ven las activas y
      dentro de sus fechas; con fechas, una oferta aparece y desaparece sola.
    </p>

    <p v-if="loading && !slides.length" class="muted">Cargando…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <!-- Formulario con vista previa en vivo -->
    <form v-if="formOpen" class="card slide-form" @submit.prevent="submit">
      <h3>{{ form.id ? "Editar diapositiva" : "Nueva diapositiva" }}</h3>

      <HeroSlideCard :slide="previewSlide" class="preview" />

      <div class="grid-2">
        <label class="field">
          <span class="muted">Etiqueta</span>
          <input v-model="form.tag" type="text" maxlength="24" list="hero-tags" required placeholder="Oferta, Evento…" />
          <datalist id="hero-tags">
            <option v-for="tag in TAG_SUGGESTIONS" :key="tag" :value="tag" />
          </datalist>
        </label>
        <label class="field">
          <span class="muted">Color</span>
          <select v-model="form.tone">
            <option v-for="tone in HERO_TONES" :key="tone.value" :value="tone.value">{{ tone.label }}</option>
          </select>
        </label>
      </div>

      <label class="field">
        <span class="muted">Título <span class="counter">{{ form.title.length }}/70</span></span>
        <input v-model="form.title" type="text" maxlength="70" required />
      </label>
      <label class="field">
        <span class="muted">Texto (opcional) <span class="counter">{{ form.text.length }}/160</span></span>
        <textarea v-model="form.text" rows="2" maxlength="160"></textarea>
      </label>

      <div class="grid-2">
        <label class="field">
          <span class="muted">Enlace (opcional)</span>
          <input v-model="form.linkUrl" type="text" maxlength="500" placeholder="https://… o /cuenta" />
        </label>
        <label class="field">
          <span class="muted">Texto del enlace</span>
          <input v-model="form.linkLabel" type="text" maxlength="30" :required="!!form.linkUrl.trim()" placeholder="Reservar plaza" />
        </label>
      </div>

      <div class="grid-2">
        <label class="field">
          <span class="muted">Desde (opcional)</span>
          <input v-model="form.startDate" type="date" />
        </label>
        <label class="field">
          <span class="muted">Hasta, incluido (opcional)</span>
          <input v-model="form.endDate" type="date" :min="form.startDate || undefined" />
        </label>
      </div>

      <label class="check">
        <input v-model="form.active" type="checkbox" />
        <span>Activa (si no, queda guardada pero no se muestra)</span>
      </label>

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>
      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">{{ saving ? "Guardando…" : "Guardar" }}</button>
        <button class="button secondary" type="button" :disabled="saving" @click="closeForm">Cancelar</button>
      </div>
    </form>

    <!-- Listado -->
    <p v-if="!loading && !loadError && !slides.length" class="muted">
      No hay diapositivas: la portada de la carta no muestra el carrusel.
    </p>
    <div v-for="(slide, i) in slides" :key="slide.id" class="card slide-row">
      <HeroSlideCard :slide="slide" class="mini" />
      <div class="slide-meta">
        <span class="status" :class="`status-${statusOf(slide).key}`">{{ statusOf(slide).label }}</span>
        <span v-if="slide.startDate || slide.endDate" class="muted">{{ dateRange(slide) }}</span>
      </div>

      <div v-if="pendingDeleteId === slide.id" class="row-actions">
        <span class="muted">¿Eliminar?</span>
        <button class="button secondary" type="button" :disabled="busy" @click="remove(slide.id)">Sí</button>
        <button class="button secondary" type="button" @click="pendingDeleteId = ''">No</button>
      </div>
      <div v-else class="row-actions">
        <button class="button secondary icon" type="button" :disabled="busy || i === 0" aria-label="Subir" @click="move(slide.id, 'UP')">↑</button>
        <button class="button secondary icon" type="button" :disabled="busy || i === slides.length - 1" aria-label="Bajar" @click="move(slide.id, 'DOWN')">↓</button>
        <button class="button secondary" type="button" :disabled="busy || formOpen" @click="startEdit(slide)">Editar</button>
        <button class="button secondary" type="button" :disabled="busy" @click="pendingDeleteId = slide.id">Eliminar</button>
      </div>
    </div>
    <p v-if="actionError" class="muted" style="color: var(--danger)">{{ actionError }}</p>
  </section>
</template>

<script setup lang="ts">
import {
  ALL_HERO_SLIDES_QUERY,
  CREATE_HERO_SLIDE,
  DELETE_HERO_SLIDE,
  HERO_SLIDES_QUERY,
  HERO_TONES,
  MOVE_HERO_SLIDE,
  UPDATE_HERO_SLIDE,
  type HeroSlide,
  type HeroTone,
} from "~/composables/useHeroSlides";

const TAG_SUGGESTIONS = ["Oferta", "Evento", "Novedad", "Noticia", "Fidelización", "Taller"];

const { result, loading, error, refetch } = useQuery<{ allHeroSlides: HeroSlide[] }>(ALL_HERO_SLIDES_QUERY, null, {
  fetchPolicy: "network-only",
});
const slides = computed(() => result.value?.allHeroSlides ?? []);
const loadError = computed(() => (error.value ? "No se pudieron cargar las diapositivas." : ""));

// Tras cada cambio se recarga el listado y tambien la consulta publica, para que la portada de
// la carta en este mismo navegador no muestre una version vieja sacada de la cache.
const refetchQueries = [{ query: HERO_SLIDES_QUERY }];

// --- Estado de cada diapositiva (en dias de la tienda) ---
const { toStoreInput } = useStoreTime();
const today = toStoreInput(new Date()).slice(0, 10);

function statusOf(slide: HeroSlide) {
  if (!slide.active) return { key: "hidden", label: "Oculta" };
  if (slide.startDate && slide.startDate > today) return { key: "scheduled", label: "Programada" };
  if (slide.endDate && slide.endDate < today) return { key: "expired", label: "Caducada" };
  return { key: "live", label: "Visible" };
}

function formatDay(date: string) {
  // Con el año solo si no es el actual: "23 sept", pero "1 ene 2027".
  const year = date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year, timeZone: "UTC" });
}
function dateRange(slide: HeroSlide) {
  if (slide.startDate && slide.endDate) return `${formatDay(slide.startDate)} – ${formatDay(slide.endDate)}`;
  if (slide.startDate) return `desde ${formatDay(slide.startDate)}`;
  return `hasta ${formatDay(slide.endDate!)}`;
}

// --- Formulario ---
function emptyForm() {
  return {
    id: "",
    tag: "",
    title: "",
    text: "",
    tone: "teal" as HeroTone,
    linkUrl: "",
    linkLabel: "",
    startDate: "",
    endDate: "",
    active: true,
  };
}
const form = reactive(emptyForm());
const formOpen = ref(false);
const saving = ref(false);
const formError = ref("");

const previewSlide = computed(() => ({
  tag: form.tag || "Etiqueta",
  title: form.title || "Título de la diapositiva",
  text: form.text || null,
  tone: form.tone,
  linkUrl: form.linkUrl.trim() || null,
  linkLabel: form.linkLabel.trim() || null,
}));

function startCreate() {
  Object.assign(form, emptyForm());
  formError.value = "";
  formOpen.value = true;
}
function startEdit(slide: HeroSlide) {
  Object.assign(form, {
    id: slide.id,
    tag: slide.tag,
    title: slide.title,
    text: slide.text ?? "",
    tone: slide.tone,
    linkUrl: slide.linkUrl ?? "",
    linkLabel: slide.linkLabel ?? "",
    startDate: slide.startDate ?? "",
    endDate: slide.endDate ?? "",
    active: slide.active,
  });
  formError.value = "";
  formOpen.value = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function closeForm() {
  formOpen.value = false;
}

async function submit() {
  saving.value = true;
  formError.value = "";
  const input = {
    tag: form.tag.trim(),
    title: form.title.trim(),
    text: form.text.trim() || null,
    tone: form.tone,
    linkUrl: form.linkUrl.trim() || null,
    linkLabel: form.linkLabel.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    active: form.active,
  };
  try {
    if (form.id) {
      await useMutation(UPDATE_HERO_SLIDE).mutate({ id: form.id, input }, { refetchQueries });
    } else {
      await useMutation(CREATE_HERO_SLIDE).mutate({ input }, { refetchQueries });
    }
    await refetch();
    formOpen.value = false;
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar";
  } finally {
    saving.value = false;
  }
}

// --- Orden y borrado ---
const busy = ref(false);
const actionError = ref("");
const pendingDeleteId = ref("");

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  actionError.value = "";
  try {
    await action();
    await refetch();
  } catch (err: any) {
    actionError.value = err?.message ?? "No se pudo aplicar el cambio";
  } finally {
    busy.value = false;
  }
}

function move(id: string, direction: "UP" | "DOWN") {
  return run(() => useMutation(MOVE_HERO_SLIDE).mutate({ id, direction }, { refetchQueries }));
}
function remove(id: string) {
  return run(async () => {
    await useMutation(DELETE_HERO_SLIDE).mutate({ id }, { refetchQueries });
    pendingDeleteId.value = "";
  });
}
</script>

<style scoped>
.hero-admin { max-width: 640px; }
.hero-admin-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hero-admin-header h2 { margin: 0; }
.intro { margin: 8px 0 16px; font-size: 14px; }

.slide-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.slide-form h3 { margin: 0; }
.preview { margin-bottom: 4px; }
/* Vistas previas: el enlace se ve pero no navega fuera del panel. */
.slide-form > .preview,
.slide-row > .mini { pointer-events: none; }
.grid-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
@media (max-width: 480px) {
  .grid-2 { grid-template-columns: minmax(0, 1fr); }
}
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.counter { float: right; font-size: 12px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.check input { width: auto; margin: 0; }
.form-actions { display: flex; gap: 8px; }

input[type="text"], input[type="date"], textarea, select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}

.slide-row { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.slide-row > .mini { min-height: 110px; padding: 14px 16px; }
.slide-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.status {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--bg);
  background: var(--text-muted);
}
.status-live { background: var(--accent-strong); }
.status-scheduled { background: var(--color4); }
.status-expired { background: var(--danger); }
.row-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.icon { min-width: 40px; padding-left: 0; padding-right: 0; }
</style>
