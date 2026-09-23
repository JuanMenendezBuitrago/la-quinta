// @ts-ignore - modulo virtual generado por @nuxtjs/apollo
import { NuxtApollo } from "#apollo";

/**
 * Si NUXT_PUBLIC_GRAPHQL_WS es una ruta relativa (p. ej. "/graphql"), la convierte en una URL
 * ws:// o wss:// con el host desde el que se esta viendo la pagina. Asi el mismo build sirve
 * en localhost, en la red local y detras de un tunel https (ngrok) sin cambiar el .env.
 * Debe ejecutarse antes que el plugin de Apollo, que lee esta config al crear el cliente.
 */
export default defineNuxtPlugin({
  name: "apollo-ws-url",
  enforce: "pre",
  setup() {
    const secure = location.protocol === "https:";
    const scheme = secure ? "wss:" : "ws:";

    for (const client of Object.values<any>(NuxtApollo.clients)) {
      const ws: string | undefined = client.wsEndpoint;
      if (!ws?.startsWith("/")) continue;
      // Entrando directo por el servidor de Nuxt (p. ej. :3000) no hay proxy de websockets:
      // se conecta a la API en :4000. Por nginx o un tunel (puerto por defecto) va al mismo origen.
      const host = location.port && location.port !== "80" && location.port !== "443" ? `${location.hostname}:4000` : location.host;
      client.wsEndpoint = `${scheme}//${host}${ws}`;
    }
  },
});
