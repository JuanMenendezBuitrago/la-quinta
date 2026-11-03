import { IncomingMessage } from "http";
import { GraphQLError } from "graphql";
import { Types } from "mongoose";
import { verifyToken } from "../modules/users/auth";
import { StaffRole, StaffUser, User } from "../modules/users/model";
import { pubsub } from "../config/pubsub";
import { clientIpOf } from "../config/rateLimit";

export interface GraphQLContext {
  pubsub: typeof pubsub;
  customerId: string | null;
  /**
   * id: a quien se atribuye lo que se hace (en una cuenta compartida, la persona elegida).
   * accountId: la cuenta con la que se inicio sesion, que es la que da los permisos (role).
   */
  staff: { id: string; accountId: string; role: StaffRole } | null;
  /** IP del cliente para los limites por conexion (null si no se sabe, y en websocket). */
  clientIp: string | null;
  /** Solo en websocket: el token, para volver a comprobar la sesion mientras dura la suscripcion. */
  wsToken?: string | null;
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
  return buildContextFromToken(token, clientIpOf(req));
}

/** Contexto para conexiones websocket (subscriptions): el token viaja en connectionParams. */
export function buildWsContext(connectionParams: Record<string, unknown>): Promise<GraphQLContext> {
  // El cliente de @nuxtjs/apollo envia { headers: { Authorization: "Bearer ..." } }; se aceptan
  // tambien las variantes planas por si otro cliente manda { authorization: "Bearer ..." }.
  const headers = (connectionParams?.headers ?? {}) as Record<string, unknown>;
  const raw =
    connectionParams?.authorization ?? connectionParams?.Authorization ?? headers.Authorization ?? headers.authorization;
  const token = extractToken(typeof raw === "string" ? raw : null);
  return buildContextFromToken(token).then((ctx) => ({ ...ctx, wsToken: token }));
}

/**
 * Una suscripcion dura lo que la conexion (horas, en la tablet del local): la sesion se comprobo al
 * empezar, pero desde entonces la cuenta pudo desactivarse o cambiar de contraseña. Se vuelve a
 * mirar antes de entregar cada evento, con una cache corta para no ir a la base de datos con cada
 * pedido: como mucho, unos segundos de retraso en cortar.
 */
const WS_RECHECK_MS = 30_000;
const wsChecks = new Map<string, { at: number; ok: boolean }>();

export async function wsSessionStillValid(ctx: GraphQLContext) {
  if (!ctx.wsToken) return !ctx.staff && !ctx.customerId;
  const cached = wsChecks.get(ctx.wsToken);
  if (cached && Date.now() - cached.at < WS_RECHECK_MS) return cached.ok;
  const now = await authFromToken(ctx.wsToken);
  const ok = ctx.staff ? now.staff?.accountId === ctx.staff.accountId : now.customerId === ctx.customerId && !!ctx.customerId;
  if (wsChecks.size > 1000) wsChecks.clear();
  wsChecks.set(ctx.wsToken, { at: Date.now(), ok });
  return ok;
}

async function buildContextFromToken(token: string | null, clientIp: string | null = null): Promise<GraphQLContext> {
  return { pubsub, ...(await authFromToken(token)), clientIp };
}

/**
 * Quien hace la peticion segun el token, comprobado contra la base de datos: lo usan el contexto
 * GraphQL y las rutas de subida (uploads/router.ts), para que las dos apliquen las mismas reglas.
 */
export async function authFromToken(token: string | null): Promise<Pick<GraphQLContext, "customerId" | "staff">> {
  const payload = token ? verifyToken(token) : null;

  // Un token de cliente sigue siendo valido tras suprimir su cuenta (dura hasta 30 dias):
  // se comprueba aqui que la cuenta existe y no esta suprimida.
  let customerId = payload?.kind === "customer" ? payload.sub : null;
  if (customerId && !(await User.exists({ _id: customerId, deletedAt: { $exists: false } }))) {
    customerId = null;
  }

  // Igual con el personal: al desactivar una cuenta, su sesion abierta deja de valer al momento.
  // El rol sale de la cuenta, no del token: si gestion pasa a alguien a barra, cuenta ya en su
  // siguiente peticion (el token dura 30 dias). Y los tokens de antes de cambiar la contraseña
  // dejan de valer (sessionsValidFrom).
  let staff: GraphQLContext["staff"] = null;
  if (payload?.kind === "staff" && Types.ObjectId.isValid(payload.sub)) {
    const account = await StaffUser.findOne({ _id: payload.sub, active: { $ne: false } })
      .select("shared role sessionsValidFrom")
      .lean();
    const issuedAt = (payload.iat ?? 0) * 1000;
    if (account && !(account.sessionsValidFrom && issuedAt < account.sessionsValidFrom.getTime())) {
      staff = { id: payload.sub, accountId: payload.sub, role: account.role };
      // Cuenta compartida con alguien elegido: si ya no vale (desactivado, borrado, la cuenta dejo
      // de ser compartida...), se ignora y la web vuelve a preguntar quien es.
      if (payload.actor && account.shared && (await isActingCandidate(payload.actor))) staff.id = payload.actor;
    }
  }

  return { customerId, staff };
}

/** Puede usar una cuenta compartida: cuenta propia activa y no compartida. */
export async function isActingCandidate(staffId: string) {
  if (!Types.ObjectId.isValid(staffId)) return false;
  return !!(await StaffUser.exists({ _id: staffId, active: { $ne: false }, shared: { $ne: true } }));
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

/**
 * Para tocar cuentas del personal (la propia incluida): no vale una cuenta compartida usada por
 * alguien elegido sin contraseña. Esa persona tiene que entrar directamente con su cuenta.
 */
export function requireOwnStaffSession(ctx: GraphQLContext, roles?: StaffRole[]) {
  const staff = requireStaff(ctx, roles);
  if (staff.id !== staff.accountId) {
    throw new GraphQLError("Para editar cuentas del personal entra con tu propia cuenta", { extensions: { code: "FORBIDDEN" } });
  }
  return staff;
}
