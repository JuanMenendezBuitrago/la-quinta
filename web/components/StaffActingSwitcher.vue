<template>
  <!-- Cuenta compartida: el equipo a la vista en la cabecera; un toque cambia quien la usa y lo
       siguiente que se haga (cobrar, canjear sellos...) queda a nombre de esa persona. -->
  <div class="acting-switcher">
    <div class="people" role="group" aria-label="Quién está usando la cuenta">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="person"
        :class="{ active: option.id === activeId }"
        :aria-pressed="option.id === activeId"
        :aria-label="option.name"
        :title="option.name"
        :disabled="busy"
        @click="choose(option)"
      >
        <UserAvatar :avatar="option.avatar" :name="option.name" :size="30" />
      </button>
    </div>
    <!-- Quien la usa ahora, con su nombre: a su nombre queda lo que se haga -->
    <span v-if="activeName" class="acting-name" aria-live="polite">{{ activeName }}</span>
  </div>
</template>

<script setup lang="ts">
import { ACTING_STAFF_OPTIONS, useStaffAuth, type StaffPerson } from "~/composables/useAuth";
import UserAvatar from "~/components/UserAvatar.vue";

const { staff, setActingStaff } = useStaffAuth();
const { result } = useQuery<{ actingStaffOptions: StaffPerson[] }>(ACTING_STAFF_OPTIONS);
const options = computed(() => result.value?.actingStaffOptions ?? []);
const activeId = computed(() => staff.value?.actingAs?.id ?? null);
const activeName = computed(() => staff.value?.actingAs?.name ?? "");

const busy = ref(false);

async function choose(person: StaffPerson) {
  if (person.id === activeId.value) return;
  busy.value = true;
  try {
    await setActingStaff(person);
  } catch {
    // Sin cambio: sigue marcada la persona anterior, que es a cuyo nombre queda lo que se haga
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.acting-switcher { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* Si no caben todos (movil con mucho equipo), se desplazan en horizontal; el nombre se queda fijo */
.people { display: flex; align-items: center; gap: 4px; min-width: 0; overflow-x: auto; padding: 3px; }
.acting-name {
  flex-shrink: 0;
  max-width: 12em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.person {
  flex-shrink: 0;
  display: inline-flex;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}
.person:hover { opacity: 0.85; }
.person.active { border-color: var(--accent); opacity: 1; }
.person:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.person:disabled { cursor: wait; }
</style>
