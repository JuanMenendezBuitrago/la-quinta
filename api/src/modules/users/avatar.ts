import fs from "fs/promises";
import path from "path";

/**
 * Avatar de clientes y personal. Se guarda como texto en `avatar`:
 * - "preset:<id>": uno de los avatares ilustrados (los dibuja la web; ver web/composables/useAvatar.ts).
 * - "/uploads/avatars/<uuid>.<ext>": una foto subida por el propio usuario (ver uploads/router.ts).
 * Sin avatar, la web muestra las iniciales.
 */
export const AVATAR_PRESETS = [
  "cafe",
  "vaso",
  "croissant",
  "pastel",
  "hoja",
  "flor",
  "sol",
  "luna",
  "estrella",
  "corazon",
  "musica",
  "bici",
  "gato",
  "perro",
  "pajaro",
] as const;

export const AVATAR_UPLOAD_PREFIX = "/uploads/avatars/";

/** Valor a guardar para un preset, o error si el id no existe. null quita el avatar. */
export function presetAvatarValue(preset: string | null | undefined): string | null {
  if (!preset) return null;
  if (!(AVATAR_PRESETS as readonly string[]).includes(preset)) throw new Error("Avatar no valido");
  return `preset:${preset}`;
}

/**
 * Borra del disco la foto de un avatar anterior (los presets no tienen archivo). Nunca lanza:
 * un archivo huerfano no debe impedir cambiar el avatar ni suprimir la cuenta.
 */
export async function removeAvatarFile(avatar: string | null | undefined, uploadDir: string) {
  if (!avatar?.startsWith(AVATAR_UPLOAD_PREFIX)) return;
  const filename = path.basename(avatar);
  try {
    await fs.unlink(path.join(uploadDir, "avatars", filename));
  } catch {
    // ya no existia
  }
}
