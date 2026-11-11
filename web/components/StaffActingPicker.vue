<template>
  <!-- Cuenta compartida: al guardar cada pedido (tomar pedido), quien lo toma, y al cobrar en la
       cola, quien cobra. Al entrar no se pregunta: solo aqui. Sin contraseña: solo decide a nombre de quien queda (los permisos siguen
       siendo los de la cuenta). Se puede volver al ticket sin elegir, y entonces no se guarda. -->
  <dialog ref="dialog" class="acting-picker" aria-labelledby="acting-picker-title" tabindex="-1" @cancel.prevent="emit('cancel')">
    <h2 id="acting-picker-title">{{ title }}</h2>
    <p class="muted">Entraste con <strong>{{ staff?.name }}</strong>.</p>
    <p v-if="loading && !options.length" class="muted">Cargando…</p>
    <ul class="accounts">
      <li v-for="option in options" :key="option.id">
        <button
          type="button"
          class="account"
          :class="{ current: option.id === staff?.actingAs?.id }"
          :disabled="busy"
          @click="choose(option)"
        >
          <UserAvatar :avatar="option.avatar" :name="option.name" :size="72" />
          <span class="account-name">{{ option.name }}</span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="muted error" role="alert">{{ error }}</p>
    <button type="button" class="link-button" :disabled="busy" @click="emit('cancel')">{{ backLabel }}</button>
  </dialog>
</template>

<script setup lang="ts">
import { ACTING_STAFF_OPTIONS, useStaffAuth, type StaffPerson } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";

withDefaults(defineProps<{ title?: string; backLabel?: string }>(), {
  title: "¿Quién toma el pedido?",
  backLabel: "Volver al ticket",
});
const emit = defineEmits<{ chosen: []; cancel: [] }>();

const { staff, setActingStaff } = useStaffAuth();
// Se abre en cada pedido: las cuentas, al momento de la cache (y se refrescan detras).
const { result, loading } = useQuery<{ actingStaffOptions: StaffPerson[] }>(ACTING_STAFF_OPTIONS, null, {
  fetchPolicy: "cache-and-network",
});
const options = computed(() => result.value?.actingStaffOptions ?? []);

const busy = ref(false);
const error = ref("");
const dialog = ref<HTMLDialogElement | null>(null);

// Quien lo usa lo monta solo mientras pregunta (ver StaffOrderTaker.vue y la cola en staff/index.vue).
// El foco al propio modal: al abrirse las cuentas aun no han cargado y se lo llevaria "Volver".
onMounted(() => {
  dialog.value?.showModal();
  dialog.value?.focus();
});

async function choose(person: StaffPerson) {
  busy.value = true;
  error.value = "";
  try {
    // Si ya era esa persona no hace falta pedir otro token.
    if (person.id !== staff.value?.actingAs?.id) await setActingStaff(person);
    emit("chosen");
  } catch (err: any) {
    error.value = err?.message ?? "No se pudo elegir";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
/* Como la lista de cuentas del login (StaffLogin.vue), en un modal */
.acting-picker {
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 20px 20px 16px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  text-align: center;
}
.acting-picker[open] { display: flex; flex-direction: column; align-items: center; }
.acting-picker:focus { outline: none; }
.acting-picker::backdrop { background: rgba(0, 0, 0, 0.45); }
.acting-picker h2 { margin: 0 0 4px; }
.acting-picker p { margin: 0; }
.accounts {
  list-style: none;
  margin: 12px 0 20px;
  padding: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, 140px);
  justify-content: center;
  gap: 12px;
}
.accounts li { display: flex; }
.account {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--surface-alt);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.account:hover { border-color: var(--field-border); }
/* Quien tomo el pedido anterior: lo mas probable es que siga siendo la misma persona */
.account.current { border-color: var(--accent); }
.account:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.account-name { font-weight: 600; font-size: 14px; text-align: center; overflow-wrap: anywhere; }
.error { color: var(--danger); margin: 0 0 8px; }
.link-button {
  margin-top: 8px;
  border: none;
  background: none;
  padding: 4px 0;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.link-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
