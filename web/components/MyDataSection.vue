<template>
  <section class="my-data-section">
    <p class="eyebrow">Mis datos</p>
    <div class="card my-data-card">
      <form class="name-row" @submit.prevent="saveName">
        <label class="field">
          <span class="muted">Nombre</span>
          <input v-model="name" type="text" maxlength="80" required />
        </label>
        <button class="button secondary" type="submit" :disabled="savingName || !nameChanged">
          {{ savingName ? "Guardando…" : "Guardar" }}
        </button>
      </form>
      <p v-if="contact" class="muted contact">Acceso con: {{ contact }}</p>
      <p v-if="nameSaved" class="muted ok">Nombre actualizado ✓</p>

      <!-- Autorizacion aparte y opcional para las novedades: se marca y se desmarca cuando se quiera -->
      <label v-if="contactResult?.me?.email" class="newsletter">
        <input type="checkbox" :checked="newsletterSubscribed" :disabled="savingNewsletter" @change="toggleNewsletter" />
        <span>
          Quiero recibir por email novedades de La Quinta: ofertas, eventos y nuevos cafés. Puedo
          darme de baja cuando quiera desde aquí o desde cualquier correo.
        </span>
      </label>
      <p v-else-if="contactResult?.me" class="muted contact">
        Las novedades por email solo están disponibles para cuentas con email.
      </p>

      <div class="actions">
        <button class="button secondary" type="button" :disabled="exporting" @click="downloadData">
          {{ exporting ? "Preparando…" : "Descargar mis datos" }}
        </button>
        <button v-if="!confirmingDelete" class="button secondary danger" type="button" @click="confirmingDelete = true">
          Eliminar mi cuenta
        </button>
      </div>

      <!-- Confirmacion en la propia pagina (sin confirm() del navegador). -->
      <div v-if="confirmingDelete" class="delete-confirm" role="alert">
        <p>
          <strong>¿Eliminar tu cuenta?</strong> Borraremos tu nombre, email y teléfono y perderás tus
          sellos. Los pedidos que ya hiciste se conservan sin tus datos, porque la ley nos obliga a
          guardarlos para la contabilidad. No se puede deshacer.
        </p>
        <div class="actions">
          <button class="button danger-solid" type="button" :disabled="deleting" @click="deleteAccount">
            {{ deleting ? "Eliminando…" : "Sí, eliminar mi cuenta" }}
          </button>
          <button class="button secondary" type="button" :disabled="deleting" @click="confirmingDelete = false">
            No, volver
          </button>
        </div>
      </div>

      <p v-if="error" class="muted" style="color: var(--danger)">{{ error }}</p>
      <p class="muted legal-note">
        Puedes consultar cómo tratamos tus datos en la
        <NuxtLink to="/privacidad">política de tratamiento de datos</NuxtLink>.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { gql } from "graphql-tag";
import { useAuth } from "~/composables/useAuth";

const emit = defineEmits<{ (e: "deleted"): void }>();

const CONTACT_QUERY = gql`
  query MyContact {
    me {
      id
      email
      phone
      newsletterSubscribed
    }
  }
`;
const UPDATE_PROFILE = gql`
  mutation UpdateMyProfile($name: String!) {
    updateMyProfile(name: $name) {
      id
      name
    }
  }
`;
const SET_NEWSLETTER = gql`
  mutation SetMyNewsletterSubscription($subscribed: Boolean!) {
    setMyNewsletterSubscription(subscribed: $subscribed) {
      id
      newsletterSubscribed
    }
  }
`;
const EXPORT_DATA = gql`
  query ExportMyData {
    exportMyData
  }
`;
const DELETE_ACCOUNT = gql`
  mutation DeleteMyAccount {
    deleteMyAccount
  }
`;

const { customer, logout } = useAuth();
const { result: contactResult } = useQuery(CONTACT_QUERY);
const contact = computed(() => contactResult.value?.me?.email ?? contactResult.value?.me?.phone ?? "");

const error = ref("");

// --- Derecho de actualizacion ---
const name = ref(customer.value?.name ?? "");
const nameChanged = computed(() => name.value.trim() !== "" && name.value.trim() !== customer.value?.name);
const savingName = ref(false);
const nameSaved = ref(false);

async function saveName() {
  savingName.value = true;
  error.value = "";
  nameSaved.value = false;
  try {
    const { mutate } = useMutation(UPDATE_PROFILE);
    const result = await mutate({ name: name.value.trim() });
    const updated = result?.data?.updateMyProfile;
    if (updated && customer.value) customer.value = { ...customer.value, name: updated.name };
    nameSaved.value = true;
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo guardar el nombre";
  } finally {
    savingName.value = false;
  }
}

// --- Novedades por email (Apollo actualiza me.newsletterSubscribed en cache con la respuesta) ---
const newsletterSubscribed = computed(() => !!contactResult.value?.me?.newsletterSubscribed);
const savingNewsletter = ref(false);
const { mutate: setNewsletter } = useMutation(SET_NEWSLETTER);

async function toggleNewsletter(event: Event) {
  const input = event.target as HTMLInputElement;
  savingNewsletter.value = true;
  error.value = "";
  try {
    await setNewsletter({ subscribed: input.checked });
  } catch (err: any) {
    input.checked = newsletterSubscribed.value;
    error.value = err?.message ?? "No se pudo guardar tu preferencia";
  } finally {
    savingNewsletter.value = false;
  }
}

// --- Derecho de acceso ---
const exporting = ref(false);

async function downloadData() {
  exporting.value = true;
  error.value = "";
  try {
    const { defaultClient } = useNuxtApp().$apollo;
    const { data } = await defaultClient.query({ query: EXPORT_DATA, fetchPolicy: "network-only" });
    const blob = new Blob([data.exportMyData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-datos-la-quinta-${customer.value?.customerCode ?? "cliente"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    error.value = err?.message ?? "No se pudieron descargar tus datos";
  } finally {
    exporting.value = false;
  }
}

// --- Derecho de supresion ---
const confirmingDelete = ref(false);
const deleting = ref(false);

async function deleteAccount() {
  deleting.value = true;
  error.value = "";
  try {
    const { mutate } = useMutation(DELETE_ACCOUNT);
    await mutate();
    await logout();
    emit("deleted");
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo eliminar la cuenta";
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.my-data-section { margin-top: 32px; }
.my-data-card { display: flex; flex-direction: column; gap: 12px; }
.name-row { display: flex; align-items: flex-end; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.field input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
.contact, .ok, .legal-note { margin: 0; font-size: 13px; }
.newsletter { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; line-height: 1.45; cursor: pointer; }
.newsletter input { margin-top: 3px; flex-shrink: 0; width: auto; }
.ok { color: var(--accent-strong); }
.legal-note a { color: inherit; text-decoration: underline; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.danger { color: var(--danger); border-color: var(--danger); }
.danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; }
.delete-confirm {
  border: 1px solid var(--danger);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.delete-confirm p { margin: 0; font-size: 14px; }
</style>
