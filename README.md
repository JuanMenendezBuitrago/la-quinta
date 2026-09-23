# La Quinta — web app

Esqueleto inicial de la web app de La Quinta (cafetería de especialidad):
carta digital, pedidos para recoger (pago en tienda) y fidelización propia.

Sigue la propuesta de arquitectura del proyecto: monolito modular en
Node.js + GraphQL, frontend en Nuxt 3 como PWA, MongoDB + Redis, y un
panel de personal para gestionar la cola de pedidos en tiempo real.

## Estructura

```
la-quinta/
  api/          API GraphQL (Node.js + TypeScript + Apollo Server)
    src/modules/menu       carta: categorías y productos
    src/modules/orders     pedidos y su estado (nuevo → preparación → listo → entregado)
    src/modules/loyalty    ledger de sellos de fidelización
    src/modules/users      clientes (login por código) y personal (usuario/contraseña)
  web/          Frontend Nuxt 3 (PWA) — carta, carrito, cuenta de cliente, panel de personal
  nginx/        Proxy inverso que une api + web bajo un mismo dominio
  docker-compose.yml
```

Cada módulo de la API tiene su propio `schema.ts` (tipos GraphQL),
`resolvers.ts` y `model.ts` (Mongoose). Los módulos no se importan entre sí:
cuando algo relevante ocurre (p. ej. un pedido se marca como entregado) se
publica un evento interno (`src/config/events.ts`) y el módulo interesado
(`loyalty`) se suscribe por su cuenta. Esa disciplina es la que permite
extraer un módulo a su propio servicio el día que haga falta, sin tener que
desenredar imports cruzados.

## Arrancar en local con Docker

Requiere Docker y Docker Compose.

```bash
cp .env.example .env
# Revisa .env y ajusta JWT_SECRET al menos

docker compose up --build
```

Esto levanta `mongo`, `redis`, `api` (puerto 4000), `web` (puerto 3000) y
`nginx` (puerto 80, que une todo bajo un mismo origen). Con nginx arriba,
abre `http://localhost`.

Para tener algo de carta con la que probar, ejecuta el seed dentro del
contenedor de la API (crea un producto de ejemplo y un usuario de gestión):

```bash
docker compose exec api npm run seed
```

Esto crea el usuario `gestion@laquinta.local` / `cambia-esta-clave` para
entrar al panel de personal en `/staff`, y dos productos de ejemplo en la
carta.

## Arrancar sin Docker (desarrollo)

Necesitas Mongo y Redis corriendo en local (o apuntar `MONGO_URI`/`REDIS_URL`
a una instancia remota).

```bash
# API
cd api
cp .env.example .env
npm install
npm run dev        # http://localhost:4000/graphql

# Web (en otra terminal)
cd web
cp .env.example .env
npm install
npm run dev         # http://localhost:3000
```

## Estado de este esqueleto

Lo que ya funciona de punta a punta: ver la carta, iniciar sesión por
código de un solo uso, añadir al carrito y confirmar un pedido, ver el
pedido y los sellos acumulados en "Mi cuenta", y gestionar la cola de
pedidos en tiempo real desde `/staff`.

Lo que falta a propósito, porque son decisiones de negocio o de producto
que no se han cerrado todavía (están recogidas como "riesgos y decisiones
abiertas" en la propuesta de arquitectura):

- **Contenido real de la carta.** El seed trae dos productos de ejemplo;
  hay que cargar la carta y los precios reales.
- **Envío real del código de un solo uso.** Ahora mismo se imprime en la
  consola de la API (`api/src/modules/users/auth.ts`, función
  `requestOtp`) para poder probar el flujo sin contratar un proveedor.
  Hay que conectar un proveedor de email o SMS.
- **Regla de fidelización.** Decidida: 1 sello por cada producto de un
  pedido entregado y recompensa a los 10 sellos
  (`api/src/modules/loyalty/model.ts`, `LOYALTY_RULES`).
- **Protección de datos (Ley 1581 de 2012).** Hay autorización en el login,
  política en `/privacidad` y, en «Mi cuenta → Mis datos», corrección del
  nombre, descarga de datos y supresión de la cuenta. Falta: completar la
  razón social y el NIT del responsable (panel de personal → «Pie de
  página»), revisar el texto de la política con un abogado y comprobar si
  aplica la inscripción en el Registro Nacional de Bases de Datos de la SIC.
  Si se cambia la política, actualizar `PRIVACY_POLICY_VERSION`
  (`api/src/modules/users/model.ts`) y `POLICY_VERSION`
  (`web/pages/privacidad.vue`).
- **Inventario.** Pestaña «Inventario» del panel: Barra registra entradas,
  mermas y conteos; Gestión además da de alta insumos, define las recetas
  y hace ajustes. Al entregar un pedido se descuentan los insumos de la
  receta de cada producto (`api/src/modules/inventory/listeners.ts`); los
  productos sin receta no descuentan nada. El stock es un saldo cacheado del
  ledger `StockMovement`; si alguna vez no cuadra, `docker compose exec api
  node dist/scripts/recalc-stock.js` lo recalcula. Falta cargar los insumos
  y las recetas reales.
- **Iconos de la PWA.** `web/public/icons/` está vacío; el manifest de
  `nuxt.config.ts` los referencia pero faltan los ficheros.
- Tests automatizados, CI/CD y el despliegue a un VPS (la propuesta de
  arquitectura describe el modelo con Docker Compose + Nginx + Let's
  Encrypt).

## Seguir trabajando con Claude Code

Este esqueleto se generó en una sesión de Claude en la nube, sin acceso a
tu ordenador. Para seguir desarrollándolo directamente sobre tu máquina
(con acceso a tu sistema de archivos, git, docker, etc.):

1. Descomprime este proyecto en tu ordenador.
2. Abre una terminal dentro de la carpeta `la-quinta/`.
3. Ejecuta `claude` — esa sesión de Claude Code sí tiene acceso directo a
   estos archivos y puede seguir implementando, sin necesitar ningún enlace
   adicional.

Buenos primeros encargos para esa sesión: cargar la carta real (hay una
hoja de costes y un PDF de la carta en el proyecto de La Quinta), conectar
un proveedor de email/SMS para el código de un solo uso, y generar los
iconos de la PWA.
