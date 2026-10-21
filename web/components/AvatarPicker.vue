<template>
  <div class="avatar-picker">
    <div class="current">
      <UserAvatar :avatar="avatar" :name="name" :size="72" />
      <div class="current-actions">
        <label class="button secondary upload" :class="{ disabled: saving }">
          <Camera :size="16" :stroke-width="1.8" />
          {{ isPhoto ? "Cambiar foto" : "Subir foto" }}
          <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="saving" @change="uploadFromInput" />
        </label>
        <button v-if="avatar" type="button" class="button secondary" :disabled="saving" @click="choosePreset(null)">
          <Trash2 :size="16" :stroke-width="1.8" />
          Quitar avatar
        </button>
      </div>
    </div>
    <p class="muted hint">La foto se recorta en cuadrado y se guarda sin los datos de ubicación de la cámara.</p>

    <p class="muted presets-title" :id="`${uid}-presets`">O elige una ilustración:</p>
    <div class="presets" role="group" :aria-labelledby="`${uid}-presets`">
      <button
        v-for="preset in AVATAR_PRESETS"
        :key="preset.id"
        type="button"
        class="preset"
        :class="{ selected: avatar === `preset:${preset.id}` }"
        :aria-pressed="avatar === `preset:${preset.id}`"
        :aria-label="preset.label"
        :title="preset.label"
        :disabled="saving"
        @click="choosePreset(preset.id)"
      >
        <UserAvatar :avatar="`preset:${preset.id}`" :size="44" />
      </button>
    </div>

    <p v-if="saving" class="muted" role="status">Guardando…</p>
    <p v-if="error" class="muted" style="color: var(--danger)" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { Camera, Trash2 } from "lucide-vue-next";
import { AVATAR_PRESETS, parseAvatar, useAvatarEditor } from "~/composables/useAvatar";
import UserAvatar from "~/components/UserAvatar.vue";

const props = defineProps<{
  who: "customer" | "staff";
  avatar?: string | null;
  name?: string | null;
  /** Gestion editando el avatar de otro miembro del personal. */
  staffId?: string | null;
}>();
const emit = defineEmits<{ (e: "changed", avatar: string | null): void }>();

const uid = useId();
const { saving, error, choosePreset, uploadFromInput } = useAvatarEditor(props.who, {
  staffId: () => props.staffId,
  onChange: (avatar) => emit("changed", avatar),
});
const isPhoto = computed(() => parseAvatar(props.avatar).kind === "image");
</script>

<style scoped>
.current { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.current-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.upload { position: relative; }
.upload.disabled { opacity: 0.45; cursor: not-allowed; }
/* El input real, invisible pero enfocable: el label hace de boton */
.upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.upload:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.hint { font-size: 12.5px; margin: 8px 0 0; }
.presets-title { margin: 16px 0 8px; }
.presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 8px; }
.preset {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  justify-self: center;
}
.preset:hover:not(:disabled) { border-color: var(--field-border); }
.preset.selected { border-color: var(--text); }
.preset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.preset:disabled { cursor: not-allowed; }
</style>
