import Redis from "ioredis";
import { env } from "./env";

// Tres conexiones separadas: es lo que exige el patron pub/sub de Redis
// (una conexion en modo "subscribe" no puede usarse para comandos normales).
export const redisClient = new Redis(env.redisUrl);
export const redisPub = new Redis(env.redisUrl);
export const redisSub = new Redis(env.redisUrl);
