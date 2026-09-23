import { IncomingMessage } from "http";
import { verifyToken } from "../modules/users/auth";
import { StaffRole } from "../modules/users/model";
import { pubsub } from "../config/pubsub";

export interface GraphQLContext {
  pubsub: typeof pubsub;
  customerId: string | null;
  staff: { id: string; role: StaffRole } | null;
}

function extractToken(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/** Contexto para peticiones HTTP normales (query/mutation). */
export function buildHttpContext(req: IncomingMessage): GraphQLContext {
  const token = extractToken(req.headers.authorization);
  return buildContextFromToken(token);
}

/** Contexto para conexiones websocket (subscriptions): el token viaja en connectionParams. */
export function buildWsContext(connectionParams: Record<string, unknown>): GraphQLContext {
  // El cliente de @nuxtjs/apollo envia { headers: { Authorization: "Bearer ..." } }; se aceptan
  // tambien las variantes planas por si otro cliente manda { authorization: "Bearer ..." }.
  const headers = (connectionParams?.headers ?? {}) as Record<string, unknown>;
  const raw =
    connectionParams?.authorization ?? connectionParams?.Authorization ?? headers.Authorization ?? headers.authorization;
  return buildContextFromToken(extractToken(typeof raw === "string" ? raw : null));
}

function buildContextFromToken(token: string | null): GraphQLContext {
  const payload = token ? verifyToken(token) : null;

  return {
    pubsub,
    customerId: payload?.kind === "customer" ? payload.sub : null,
    staff:
      payload?.kind === "staff" && payload.role
        ? { id: payload.sub, role: payload.role }
        : null,
  };
}

export function requireCustomer(ctx: GraphQLContext): string {
  if (!ctx.customerId) throw new Error("Necesitas iniciar sesion");
  return ctx.customerId;
}

export function requireStaff(ctx: GraphQLContext, roles?: StaffRole[]) {
  if (!ctx.staff) throw new Error("Necesitas iniciar sesion como personal del local");
  if (roles && !roles.includes(ctx.staff.role)) {
    throw new Error("No tienes permiso para esta accion");
  }
  return ctx.staff;
}
