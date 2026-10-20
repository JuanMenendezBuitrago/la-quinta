import { IncomingMessage } from "http";
import { GraphQLError } from "graphql";
import { verifyToken } from "../modules/users/auth";
import { StaffRole, User } from "../modules/users/model";
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
export function buildHttpContext(req: IncomingMessage): Promise<GraphQLContext> {
  const token = extractToken(req.headers.authorization);
  return buildContextFromToken(token);
}

/** Contexto para conexiones websocket (subscriptions): el token viaja en connectionParams. */
export function buildWsContext(connectionParams: Record<string, unknown>): Promise<GraphQLContext> {
  // El cliente de @nuxtjs/apollo envia { headers: { Authorization: "Bearer ..." } }; se aceptan
  // tambien las variantes planas por si otro cliente manda { authorization: "Bearer ..." }.
  const headers = (connectionParams?.headers ?? {}) as Record<string, unknown>;
  const raw =
    connectionParams?.authorization ?? connectionParams?.Authorization ?? headers.Authorization ?? headers.authorization;
  return buildContextFromToken(extractToken(typeof raw === "string" ? raw : null));
}

async function buildContextFromToken(token: string | null): Promise<GraphQLContext> {
  const payload = token ? verifyToken(token) : null;

  // Un token de cliente sigue siendo valido tras suprimir su cuenta (dura hasta 30 dias):
  // se comprueba aqui que la cuenta existe y no esta suprimida.
  let customerId = payload?.kind === "customer" ? payload.sub : null;
  if (customerId && !(await User.exists({ _id: customerId, deletedAt: { $exists: false } }))) {
    customerId = null;
  }

  return {
    pubsub,
    customerId,
    staff:
      payload?.kind === "staff" && payload.role
        ? { id: payload.sub, role: payload.role }
        : null,
  };
}

/**
 * Sin la sesion que hace falta: code UNAUTHENTICATED y `session` dice cual. La web lo usa para
 * olvidar la sesion que creia tener (cliente y personal comparten cookie: si se entra con una,
 * la otra deja de valer aunque la pestaña siga mostrandola). Ver web/plugins/apollo-auth-errors.client.ts.
 */
function unauthenticated(message: string, session: "customer" | "staff") {
  return new GraphQLError(message, { extensions: { code: "UNAUTHENTICATED", session } });
}

export function requireCustomer(ctx: GraphQLContext): string {
  if (!ctx.customerId) throw unauthenticated("Necesitas iniciar sesion", "customer");
  return ctx.customerId;
}

export function requireStaff(ctx: GraphQLContext, roles?: StaffRole[]) {
  if (!ctx.staff) throw unauthenticated("Necesitas iniciar sesion como personal del local", "staff");
  if (roles && !roles.includes(ctx.staff.role)) {
    // Con sesion valida pero sin el rol: no se cierra la sesion, solo se rechaza la accion.
    throw new GraphQLError("No tienes permiso para esta accion", { extensions: { code: "FORBIDDEN" } });
  }
  return ctx.staff;
}
