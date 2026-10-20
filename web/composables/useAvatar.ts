import { gql } from "graphql-tag";
import type { Component } from "vue";
import { Bike, Bird, CakeSlice, Cat, Coffee, Croissant, CupSoda, Dog, Flower2, Heart, Leaf, Moon, Music, Star, Sun } from "lucide-vue-next";

/**
 * Avatares de clientes y personal. El valor guardado (campo `avatar`) es:
 * - "preset:<id>": uno de estos avatares ilustrados (los ids los valida la API: api/src/modules/users/avatar.ts).
 * - "/uploads/avatars/...": una foto subida por el propio usuario.
 * Sin avatar se muestran las iniciales del nombre.
 */
export interface AvatarPreset {
  id: string;
  label: string;
  icon: Component;
  /** Fondo y color del icono: todos con contraste 3:1 o mas (WCAG 1.4.11). */
  background: string;
  color: string;
}

const TONES = [
  { background: "var(--accent)", color: "var(--bg)" },
  { background: "var(--color4)", color: "var(--bg)" },
  { background: "var(--accent-soft)", color: "#2f4948" },
  { background: "var(--color5)", color: "var(--bg)" },
  { background: "var(--danger)", color: "var(--bg)" },
];

export const AVATAR_PRESETS: AvatarPreset[] = (
  [
    ["cafe", "Taza de café", Coffee],
    ["vaso", "Vaso para llevar", CupSoda],
    ["croissant", "Croissant", Croissant],
    ["pastel", "Porción de pastel", CakeSlice],
    ["hoja", "Hoja", Leaf],
    ["flor", "Flor", Flower2],
    ["sol", "Sol", Sun],
    ["luna", "Luna", Moon],
    ["estrella", "Estrella", Star],
    ["corazon", "Corazón", Heart],
    ["musica", "Música", Music],
    ["bici", "Bicicleta", Bike],
    ["gato", "Gato", Cat],
    ["perro", "Perro", Dog],
    ["pajaro", "Pájaro", Bird],
  ] as const
).map(([id, label, icon], i) => ({ id, label, icon, ...TONES[i % TONES.length]! }));

export type ParsedAvatar =
  | { kind: "preset"; preset: AvatarPreset }
  | { kind: "image"; path: string }
  | { kind: "initials" };

export function parseAvatar(avatar?: string | null): ParsedAvatar {
  if (avatar?.startsWith("preset:")) {
    const preset = AVATAR_PRESETS.find((p) => p.id === avatar.slice("preset:".length));
    if (preset) return { kind: "preset", preset };
  }
  if (avatar?.startsWith("/uploads/")) return { kind: "image", path: avatar };
  return { kind: "initials" };
}

export function avatarInitials(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.length === 1 ? words[0]!.slice(0, 1) : words[0]!.slice(0, 1) + words[words.length - 1]!.slice(0, 1);
  return letters.toUpperCase();
}

const SET_MY_AVATAR = gql`
  mutation SetMyAvatar($preset: String) {
    setMyAvatar(preset: $preset) {
      id
      avatar
    }
  }
`;

const SET_MY_STAFF_AVATAR = gql`
  mutation SetMyStaffAvatar($preset: String) {
    setMyStaffAvatar(preset: $preset) {
      id
      avatar
    }
  }
`;

/** Lado del recorte: suficiente para verse nitido a 2x en el tamaño mas grande en que se muestra. */
const AVATAR_SIDE = 256;

/**
 * Recorta la foto a un cuadrado centrado y la vuelve a codificar en el navegador. Ademas de
 * reducir el peso, al redibujarla se pierden los metadatos EXIF (ubicacion GPS, modelo del movil...).
 */
async function squareJpeg(file: File): Promise<Blob> {
  // imageOrientation: respeta la rotacion que indica el EXIF antes de descartarlo
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  // fondo crema: un PNG con transparencia no queda negro al pasarlo a JPEG
  ctx.fillStyle = "#faf6ce";
  ctx.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIDE,
    AVATAR_SIDE
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return blob;
}

/**
 * Elegir avatar (preset o foto) para la sesion actual: cliente o personal. Actualiza el estado
 * de sesion (useAuth / useStaffAuth comparten estos useState) para que la barra superior cambie al
 * momento. Se llama durante el setup del componente: useRuntimeConfig y useCookie lo necesitan.
 */
export function useAvatarEditor(who: "customer" | "staff") {
  const config = useRuntimeConfig();
  const token = useCookie("lq_auth_token");
  const session = useState<{ avatar?: string | null } | null>(who === "customer" ? "lq-customer" : "lq-staff");
  const { mutate: setCustomerAvatar } = useMutation(SET_MY_AVATAR);
  const { mutate: setStaffAvatar } = useMutation(SET_MY_STAFF_AVATAR);
  const saving = ref(false);
  const error = ref("");

  function applyAvatar(avatar: string | null) {
    if (session.value) session.value = { ...session.value, avatar };
  }

  /** null quita el avatar (se vuelven a ver las iniciales). */
  async function choosePreset(presetId: string | null) {
    saving.value = true;
    error.value = "";
    try {
      const result =
        who === "customer"
          ? (await setCustomerAvatar({ preset: presetId }))?.data?.setMyAvatar
          : (await setStaffAvatar({ preset: presetId }))?.data?.setMyStaffAvatar;
      applyAvatar(result?.avatar ?? null);
    } catch (err: any) {
      error.value = err?.message ?? "No se pudo guardar el avatar";
    } finally {
      saving.value = false;
    }
  }

  /** Sube la foto elegida en un <input type="file"> y vacia el input para poder repetir archivo. */
  async function uploadFromInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    saving.value = true;
    error.value = "";
    try {
      if (!file.type.startsWith("image/")) throw new Error("Elige una imagen (JPG, PNG o WEBP)");
      const blob = await squareJpeg(file);
      const body = new FormData();
      body.append("file", blob, "avatar.jpg");
      const uploadsBase = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
      const res = await fetch(`${uploadsBase}/uploads/avatar`, {
        method: "POST",
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la foto");
      applyAvatar(data.avatar);
    } catch (err: any) {
      // createImageBitmap falla con formatos que el navegador no sabe abrir (p. ej. HEIC en Chrome)
      error.value = err instanceof DOMException ? "No se pudo abrir esa imagen. Prueba con una JPG o PNG." : err?.message ?? "No se pudo subir la foto";
    } finally {
      saving.value = false;
      input.value = "";
    }
  }

  return { saving, error, choosePreset, uploadFromInput };
}
