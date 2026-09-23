export default defineNuxtConfig({
  compatibilityDate: "2024-09-01",
  devtools: { enabled: true },

  modules: ["@nuxtjs/apollo", "@vite-pwa/nuxt"],

  runtimeConfig: {
    public: {
      graphqlHttp: process.env.NUXT_PUBLIC_GRAPHQL_HTTP || "http://localhost:4000/graphql",
      graphqlWs: process.env.NUXT_PUBLIC_GRAPHQL_WS || "ws://localhost:4000/graphql",
      // Zona horaria de la tienda: en ella se eligen y muestran las horas de recogida.
      storeTimeZone: process.env.NUXT_PUBLIC_STORE_TIME_ZONE || "America/Bogota",
    },
  },

  apollo: {
    autoImports: true,
    clients: {
      default: {
        // httpEndpoint: usado por el servidor (SSR), debe resolver dentro de la red de Docker.
        // browserHttpEndpoint: usado por el navegador, debe resolver desde el host.
        httpEndpoint: process.env.GRAPHQL_HTTP_INTERNAL || process.env.NUXT_PUBLIC_GRAPHQL_HTTP || "http://localhost:4000/graphql",
        browserHttpEndpoint: process.env.NUXT_PUBLIC_GRAPHQL_HTTP || "http://localhost:4000/graphql",
        wsEndpoint: process.env.NUXT_PUBLIC_GRAPHQL_WS || "ws://localhost:4000/graphql",
        tokenName: "lq_auth_token",
        tokenStorage: "cookie",
        // Tuneles (ngrok) y proxies pueden dejar la conexion a medias sin cerrarla del todo:
        // el cliente cree que sigue conectado pero ya no le llega nada. Con este ping cada
        // 10s, si no hay respuesta el cliente lo detecta y reconecta solo.
        wsLinkOptions: { keepAlive: 10000 },
      },
    },
  },

  // Las fotos subidas viven en la API; con esta ruta tambien se ven cuando se entra directo
  // por :3000 (sin nginx) usando rutas relativas /uploads/...
  routeRules: {
    "/graphql": { proxy: `${process.env.API_INTERNAL_URL || "http://api:4000"}/graphql` },
    "/uploads/**": { proxy: `${process.env.API_INTERNAL_URL || "http://api:4000"}/uploads/**` },
  },

  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "La Quinta",
      short_name: "La Quinta",
      description: "Carta, pedidos para recoger y tarjeta de fidelización de La Quinta",
      theme_color: "#a85b2a",
      background_color: "#f6f3ef",
      display: "standalone",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    workbox: {
      navigateFallback: "/",
      globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
    },
  },

  app: {
    head: {
      title: "La Quinta",
      meta: [{ name: "description", content: "Café de especialidad — carta, pedidos y fidelización" }],
    },
  },

  css: ["~/assets/main.css"],
});
