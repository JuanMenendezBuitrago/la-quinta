/**
 * Subida de imagenes del panel (productos, cafes) al endpoint /uploads de la API.
 * Se llama durante el setup del componente: useRuntimeConfig y useCookie lo necesitan.
 */
export function useImageUpload() {
  const config = useRuntimeConfig();
  const token = useCookie("lq_auth_token");
  const uploading = ref(false);
  const uploadError = ref("");

  /**
   * Sube la imagen elegida en un <input type="file"> y devuelve su ruta, o null si no se pudo
   * (el motivo queda en uploadError). Vacia el input para poder volver a elegir el mismo archivo.
   */
  async function uploadFromInput(event: Event): Promise<string | null> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return null;

    uploading.value = true;
    uploadError.value = "";
    try {
      const uploadsBase = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
      const body = new FormData();
      body.append("file", file);

      const res = await fetch(`${uploadsBase}/uploads`, {
        method: "POST",
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la imagen");

      // Se guarda solo la ruta relativa: el host correcto para verla lo resuelve
      // cada dispositivo por su cuenta (ver useImageUrl.ts).
      return data.url as string;
    } catch (err: any) {
      uploadError.value = err?.message ?? "No se pudo subir la imagen";
      return null;
    } finally {
      uploading.value = false;
      input.value = "";
    }
  }

  return { uploading, uploadError, uploadFromInput };
}
