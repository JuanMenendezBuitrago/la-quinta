import { IncomingMessage } from "http";
import { isIP } from "net";
import { redisClient } from "./redis";

/**
 * Contador en Redis con ventana fija: suma uno y dice si ya se paso del limite. Atomico (INCR y,
 * solo la primera vez, EXPIRE), asi que muchas peticiones a la vez no se lo saltan.
 */
export async function overLimit(key: string, limit: number, windowSeconds: number) {
  const results = await redisClient.multi().incr(key).expire(key, windowSeconds, "NX").exec();
  const count = Number(results?.[0]?.[1] ?? 0);
  return count > limit;
}

/** Cuantas veces se ha contado ya en la ventana (sin sumar). */
export async function currentCount(key: string) {
  return Number(await redisClient.get(key)) || 0;
}

function bareIp(value: string | undefined | null) {
  if (!value) return null;
  const ip = value.trim().replace(/^::ffff:/, "");
  return isIP(ip) ? ip : null;
}

function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}

let warnedNoClientIp = false;

/**
 * IP del cliente para los limites por conexion. En produccion la peticion llega por el nginx del
 * VPS (y a veces ademas por el proxy de Nuxt), asi que la conexion viene de una IP privada: solo en
 * ese caso se hace caso a X-Real-IP / X-Forwarded-For (que un cliente directo podria inventarse).
 * Si no se puede saber, null: los limites por IP no se aplican (si no, se aplicarian a todos a la
 * vez) y quedan los de cada email y cada codigo, que son los que importan.
 */
export function clientIpOf(req: IncomingMessage) {
  const remote = bareIp(req.socket.remoteAddress);
  if (!remote) return null;
  if (!isPrivateIp(remote)) return remote;

  const real = bareIp(req.headers["x-real-ip"] as string | undefined);
  if (real && !isPrivateIp(real)) return real;
  // X-Forwarded-For: cada proxy añade al final; la primera publica empezando por la derecha es la
  // que vio nuestro nginx (lo de la izquierda lo puede poner el cliente).
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")
    .map(bareIp)
    .filter((ip): ip is string => !!ip);
  for (let i = forwarded.length - 1; i >= 0; i--) {
    if (!isPrivateIp(forwarded[i])) return forwarded[i];
  }

  if (!warnedNoClientIp && process.env.NODE_ENV === "production") {
    warnedNoClientIp = true;
    // eslint-disable-next-line no-console
    console.warn("[rate-limit] no llega la IP del cliente (falta X-Real-IP en el proxy): sin limites por IP");
  }
  return null;
}
