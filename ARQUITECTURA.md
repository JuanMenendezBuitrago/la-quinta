# Arquitectura La Quinta — Propuesta v1

*15 sep 2026 · Alcance: comunicación con clientes (carta, pedidos para recoger, fidelización)*

> Página con diseño completo (diagrama, tablas, roadmap): https://claude.ai/artifact/3J6cMzbnFiNXsqjkfGe4FV
>
> **Actualización:** ya existe un esqueleto de código inicial siguiendo esta arquitectura (API GraphQL modular + Nuxt 3 + Docker Compose), entregado como descarga en la conversación del 15 sep 2026. Tipa limpio (`tsc`/`nuxt typecheck`) y compila (`npm run build` en `api/` y `web/`). Ver la sección "Estado de este esqueleto" del README del proyecto para lo que falta (carta real, proveedor de OTP, iconos PWA, tests, CI/CD).

## Resumen

La Quinta es una cafetería de especialidad de un solo local: el objetivo de esta primera versión no es construir una plataforma, es quitarle fricción al mostrador. Un cliente entra a la web, ve la carta actualizada, hace el pedido con antelación para recogerlo (pago en tienda) y acumula sellos de fidelidad sin tener que llevar una tarjeta de cartón.

La propuesta evita replicar la arquitectura de microservicios de Rentuos: aquí no hay diez equipos ni un volumen que lo justifique. En su lugar, un **monolito modular** — un único servicio Node.js con límites de módulo claros (carta, pedidos, fidelización, usuarios) — que puede partirse en servicios independientes el día que el negocio lo necesite, sin rehacer nada desde cero.

- **Frontend:** Nuxt 3 (Vue 3) + TypeScript, como PWA
- **Backend:** Node.js + Apollo GraphQL Server, monolito modular
- **Datos:** MongoDB + Redis
- **Despliegue:** Docker Compose sobre un VPS
- **Pedidos v1:** recogida en tienda, pago en tienda (sin pasarela online)
- **Fidelización v1:** sistema propio (login + sellos/puntos), sin Apple/Google Wallet

## Alcance v1 vs futuro

| Área | Incluido en v1 | Fuera de alcance (futuro) |
|---|---|---|
| Carta | Categorías, productos, precios, alérgenos, disponibilidad | Variantes complejas si la carta real no las tiene |
| Pedidos | Carrito, franja horaria de recogida, estado del pedido | Pago online, entrega a domicilio, propinas |
| Fidelización | Cuenta propia, sellos/puntos por pedido, recompensas simples | Apple/Google Wallet, niveles VIP, referidos |
| Personal | Panel de cola de pedidos, marcar listo, editar carta | Turnos, inventario, TPV completo |
| Negocio | Un local | Multi-local, stock compartido |

## Arquitectura general

Tres superficies — app cliente, panel de personal y API — comparten una única base de datos. La API es un monolito modular: un proceso Node.js con módulos internos separados por dominio (carta, pedidos, fidelización, usuarios), cada uno con su propio esquema GraphQL y su propia colección en Mongo. Esa disciplina es lo que permite extraer un módulo a su propio servicio más adelante sin tocar el resto.

```
App cliente (Nuxt3/PWA) ──┐
                           ├──▶ API GraphQL (Node.js, monolito modular) ──▶ MongoDB
Panel personal ────────────┘         │                                └──▶ Redis (sesiones, pub/sub, caché)
                                      └──▶ Notificaciones (web push + email de respaldo)
```

## Stack tecnológico

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | Nuxt 3 + Vue 3 + TypeScript | SSR para que la carta cargue rápido e indexe bien; instalable como PWA |
| API | Node.js + Apollo Server + TypeScript | Esquema GraphQL único; suscripciones para la cola de pedidos en vivo |
| Base de datos | MongoDB | Esquema flexible para la carta; transacciones multi-documento para el ledger de puntos |
| Caché / tiempo real | Redis | Sesiones, pub/sub de suscripciones GraphQL, rate limiting |
| Autenticación | JWT + código de un solo uso (email/SMS) | Sin contraseñas para clientes ocasionales; contraseña solo para el equipo del local |
| Notificaciones | Web Push (PWA) + email de respaldo | Aviso de "pedido listo" sin coste por SMS |
| Despliegue | Docker Compose sobre un VPS | Mismo modelo mental que `manager-*` en Rentuos, a la escala que corresponde |

## Modelo de datos

Seis colecciones: `users`, `staff_users`, `menu_categories`, `menu_items`, `orders`, `loyalty_transactions` (esta última como ledger de movimientos, nunca se sobreescribe un saldo).

## Flujo de pedido

1. El cliente arma el pedido navegando la carta (sin login) y elige franja de recogida.
2. Confirma con login por código de un solo uso.
3. El pedido entra en tiempo real en la cola del panel de personal.
4. El personal lo prepara y marca "listo" → dispara notificación push.
5. Recogida y pago en mostrador → se genera automáticamente la transacción de fidelización.

## Roles

| Rol | Acceso |
|---|---|
| Visitante | Ver carta y programa de fidelización, sin login |
| Cliente | Pedir, ver historial, canjear sellos |
| Barra | Ver cola de pedidos, cambiar estados |
| Gestión | Todo lo anterior + editar carta, reglas de fidelización, estadísticas |

## Infraestructura

VPS pequeño (2 vCPU / 4 GB) con Docker Compose: `api`, `web`, `mongo`, `redis`, `nginx` (proxy inverso + TLS Let's Encrypt). Staging idéntico más pequeño. CI/CD con GitHub Actions (build en cada push a `main`, deploy por SSH). Observabilidad ligera: logs estructurados, monitor de disponibilidad externo, Sentry (plan gratuito).

## Seguridad y datos personales

- Contraseñas solo para el equipo; los clientes nunca crean una.
- Rate limiting en login y creación de pedidos.
- Datos del cliente limitados a lo necesario para pedido y fidelización (base RGPD).
- Exportar/borrar datos de un cliente, soportado desde el día uno.

## Roadmap

- **Fase 1 (esta propuesta):** carta digital, pedido para recoger con pago en tienda, fidelización propia, panel de personal.
- **Fase 2:** pago online (Stripe/Redsys), entrega a domicilio, recompensas más ricas.
- **Fase 3:** multi-local, Apple/Google Wallet, extracción de módulos a servicios propios si el tráfico lo pide.

## Riesgos y decisiones abiertas

- **Operativo:** sin pago online, el personal confirma el pago manualmente al entregar — falta decidir qué pasa con pedidos no recogidos.
- **Datos:** no se pudo extraer el contenido completo de la carta ni de la hoja de costes adjuntas al proyecto; el modelo de `menu_items` puede necesitar ajustes (variantes, tamaños) una vez revisadas.
- **Decisión pendiente:** regla exacta de acumulación de sellos (por importe, por unidad, o mixta) y umbral de recompensa.
- **Decisión pendiente:** canal del código de un solo uso (SMS tiene coste; email es gratis pero más lento de revisar).

**Siguiente paso sugerido:** validar el modelo de `menu_items` contra la carta real y la hoja de costes, y cerrar la regla de fidelización antes de maquetar pantallas.
