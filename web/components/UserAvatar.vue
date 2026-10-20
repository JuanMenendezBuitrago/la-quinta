<template>
  <!-- Decorativo: el nombre siempre va al lado (o en el aria-label del enlace que lo contiene) -->
  <span
    class="user-avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.4)}px`,
      background: parsed.kind === 'preset' ? parsed.preset.background : undefined,
      color: parsed.kind === 'preset' ? parsed.preset.color : undefined,
    }"
    aria-hidden="true"
  >
    <img v-if="parsed.kind === 'image'" :src="resolveImageUrl(parsed.path) ?? undefined" alt="" />
    <component
      :is="parsed.preset.icon"
      v-else-if="parsed.kind === 'preset'"
      :size="Math.round(size * 0.56)"
      :stroke-width="1.8"
    />
    <span v-else>{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
import { avatarInitials, parseAvatar } from "~/composables/useAvatar";
import { useImageUrl } from "~/composables/useImageUrl";

const props = withDefaults(defineProps<{ avatar?: string | null; name?: string | null; size?: number }>(), {
  avatar: null,
  name: null,
  size: 32,
});

const { resolveImageUrl } = useImageUrl();
const parsed = computed(() => parseAvatar(props.avatar));
const initials = computed(() => avatarInitials(props.name));
</script>

<style scoped>
/* Sin avatar: iniciales en marron sobre crema oscuro (5:1). */
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface-alt);
  color: var(--text);
  font-family: var(--font-futura-text);
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
