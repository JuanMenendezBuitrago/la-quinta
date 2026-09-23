/**
 * Las imagenes subidas se guardan en la base de datos como ruta relativa
 * (p. ej. "/uploads/xxx.jpg"), nunca con host fijo: la API se sirve en el
 * mismo host que la web pero en otro puerto, y ese host cambia segun quien
 * mire la pagina (localhost, IP de la red local, dominio real...).
 * Esta funcion la resuelve en cada dispositivo usando el host con el que
 * ESE dispositivo esta accediendo ahora mismo.
 */
export function useImageUrl() {
  const config = useRuntimeConfig();
  const requestUrl = useRequestURL();

  function resolveImageUrl(path?: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path; // URL absoluta antigua o externa: se deja tal cual

    // Si se accede por el puerto por defecto (nginx en :80, o un tunel https como ngrok),
    // /uploads ya lo sirve el mismo origen: no hay puerto 4000 accesible desde fuera.
    if (!requestUrl.port) return path;

    let apiPort = "";
    try {
      apiPort = new URL(String(config.public.graphqlHttp)).port;
    } catch {
      // ignoramos, sin puerto explicito
    }

    if (!apiPort) return path; // sin puerto propio: se asume mismo origen (p. ej. detras de nginx)

    return `${requestUrl.protocol}//${requestUrl.hostname}:${apiPort}${path}`;
  }

  return { resolveImageUrl };
}
