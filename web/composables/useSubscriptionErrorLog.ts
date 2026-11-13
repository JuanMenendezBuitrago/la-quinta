// Al recargar o salir de la pagina, el navegador cierra el WebSocket y cada suscripcion abierta
// avisa con "Socket closed". Eso no es un fallo: solo se registran los errores con la pagina viva.
let unloading = false;
if (import.meta.client) {
  window.addEventListener("pagehide", () => (unloading = true));
  window.addEventListener("beforeunload", () => (unloading = true));
  // Volver con atras/adelante (bfcache) resucita la pagina: deja de estar saliendo.
  window.addEventListener("pageshow", () => (unloading = false));
}

export function logSubscriptionError(tag: string, err: unknown) {
  if (unloading) return;
  // eslint-disable-next-line no-console
  console.error(tag, err);
}
