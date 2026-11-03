import { setResponseHeaders } from "h3";

/**
 * Cabeceras de seguridad de la web (solo en produccion: en desarrollo Vite necesita eval y su
 * propio websocket, que esta politica bloquearia).
 *
 * Content-Security-Policy, lo que permite cargar cada pagina:
 * - script-src: solo scripts de la propia web. 'unsafe-inline' porque Nuxt mete en cada pagina un
 *   script con la configuracion (window.__NUXT__.config) que cambia en cada build; aun asi no se
 *   puede cargar codigo de otros dominios.
 * - connect-src 'self': GraphQL, websocket y subidas van al mismo dominio. Es lo que mas protege:
 *   un script inyectado no podria enviar el token de sesion a otro servidor.
 * - img-src https:: la portada y la carta admiten imagenes por URL de cualquier web.
 * - Google Fonts: la hoja de estilos (fonts.googleapis.com) y las fuentes (fonts.gstatic.com).
 * - frame-ancestors 'none': nadie puede meter el panel en un iframe para engañar con clics.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const COMMON_HEADERS = {
  // Solo por HTTPS durante un año (el navegador lo ignora si llega por HTTP). Sin includeSubDomains
  // mientras no se sepa que todos los subdominios tienen HTTPS.
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
};

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return;

  nitroApp.hooks.hook("request", (event) => {
    setResponseHeaders(event, COMMON_HEADERS);
  });

  // Las paginas HTML: la politica de contenido, y sin anunciar que es Nuxt.
  nitroApp.hooks.hook("render:response", (response) => {
    response.headers ??= {};
    delete response.headers["x-powered-by"];
    response.headers["content-security-policy"] = CSP;
  });
});
