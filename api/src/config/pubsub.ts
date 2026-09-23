import { RedisPubSub } from "graphql-redis-subscriptions";
import { redisPub, redisSub } from "./redis";

// Eventos que disparan las suscripciones GraphQL.
// El panel de personal se suscribe a ORDER_QUEUE_UPDATED; el cliente,
// a ORDER_STATUS_CHANGED filtrado por su propio pedido.
export const EVENTS = {
  ORDER_QUEUE_UPDATED: "ORDER_QUEUE_UPDATED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  // Un insumo acaba de bajar a su stock minimo (o menos): aviso al personal.
  INVENTORY_LOW: "INVENTORY_LOW",
} as const;

export const pubsub = new RedisPubSub({
  publisher: redisPub,
  subscriber: redisSub,
});
