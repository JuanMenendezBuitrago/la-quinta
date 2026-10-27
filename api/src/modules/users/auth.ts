import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { env } from "../../config/env";
import { getTransporter } from "../../config/mailer";
import { redisClient } from "../../config/redis";
import { Types } from "mongoose";
import { User, StaffUser, StaffRole, StaffUserDoc, PRIVACY_POLICY_VERSION, hasCurrentConsent } from "./model";

async function sendOtpEmail(to: string, code: string): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) return; // sin SMTP_URL configurada: se queda solo en los logs (ver mas abajo)

  const minutes = Math.round(env.otpTtlSeconds / 60);
  try {
    await mailer.sendMail({
      from: env.smtpFrom,
      to,
      subject: `Tu codigo de acceso: ${code}`,
      text: `Tu codigo de acceso a La Quinta es ${code}. Caduca en ${minutes} minutos.`,
      html: `<p>Tu codigo de acceso a <strong>La Quinta</strong> es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>Caduca en ${minutes} minutos.</p>`,
    });
  } catch {
    throw new Error("No se pudo enviar el correo con el codigo. Intentalo de nuevo en unos minutos.");
  }
}

export interface AuthTokenPayload {
  sub: string;
  kind: "customer" | "staff";
  role?: StaffRole;
  // Cuenta compartida: quien la esta usando. Las acciones quedan a su nombre; los permisos son los
  // de la cuenta (sub). Lo valida el contexto GraphQL en cada peticion.
  actor?: string;
}

export function signToken(payload: AuthTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
  } catch {
    return null;
  }
}

function otpKey(email: string) {
  return `otp:${email}`;
}

function generateCustomerCode() {
  return `LQ-${randomInt(1000, 9999)}`;
}

// Lo justo para descartar lo que no puede recibir el codigo (un telefono, texto suelto...).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Los clientes entran solo con email: es por donde llega el codigo (no hay envio por SMS). Mismo
 * criterio para pedir el codigo, comprobarlo y buscar o crear la cuenta.
 */
function normalizeEmail(identifier: string) {
  const email = identifier.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Introduce un email valido");
  return email;
}

/** Cliente con ese identificador, si existe (para no volver a pedir nombre ni autorizacion). */
export async function findExistingCustomer(identifier: string) {
  return User.findOne({ email: normalizeEmail(identifier) }).select("_id privacyConsent").lean();
}

/**
 * Genera un codigo de un solo uso, lo guarda en Redis con caducidad y lo envia por email.
 * En desarrollo el codigo tambien se imprime en consola, para poder probar el flujo
 * aunque SMTP_URL no este configurada todavia.
 */
export async function requestOtp(identifier: string): Promise<void> {
  const email = normalizeEmail(identifier);
  const code = String(randomInt(100000, 999999));
  await redisClient.set(otpKey(email), code, "EX", env.otpTtlSeconds);

  if (env.nodeEnv !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[otp] codigo para ${email}: ${code} (valido ${env.otpTtlSeconds}s)`);
  }

  await sendOtpEmail(email, code);
}

export async function verifyOtpAndIssueToken(
  identifier: string,
  code: string,
  name?: string,
  acceptPrivacyPolicy = false,
  subscribeNewsletter = false
): Promise<{ token: string; user: InstanceType<typeof User> }> {
  const email = normalizeEmail(identifier);
  const stored = await redisClient.get(otpKey(email));
  if (!stored || stored !== code) {
    throw new Error("Codigo invalido o caducado");
  }

  let user = await User.findOne({ email });

  // Sin autorizacion expresa no se crea la cuenta (ni se deja entrar a quien la tiene de una
  // version anterior de la politica). El codigo no se consume, para poder reintentar.
  if (!(user && hasCurrentConsent(user)) && !acceptPrivacyPolicy) {
    throw new Error("Para continuar tienes que aceptar la politica de tratamiento de datos");
  }
  await redisClient.del(otpKey(email));

  const consent = { acceptedAt: new Date(), policyVersion: PRIVACY_POLICY_VERSION };
  if (!user) {
    user = await User.create({
      email,
      name: name?.trim() || "Cliente La Quinta",
      customerCode: generateCustomerCode(),
      privacyConsent: consent,
      // Novedades: casilla aparte y desmarcada en el alta; solo si la marca.
      ...(subscribeNewsletter ? { newsletterConsent: { acceptedAt: consent.acceptedAt } } : {}),
    });
  } else if (!hasCurrentConsent(user)) {
    user.privacyConsent = consent;
    await user.save();
  }

  const token = signToken({ sub: user._id.toString(), kind: "customer" });
  return { token, user };
}

/**
 * Bloqueo por cuenta tras varios fallos seguidos. La pantalla de login lista las cuentas del
 * personal (solo hay que adivinar la contraseña), asi que sin esto se podrian probar sin limite.
 */
const STAFF_LOGIN_MAX_FAILS = 5;
const STAFF_LOGIN_LOCK_SECONDS = 5 * 60;

function staffLoginFailsKey(staffId: string) {
  return `staff-login-fails:${staffId}`;
}

async function issueStaffToken(staff: StaffUserDoc | null, password: string) {
  if (!staff) throw new Error("Credenciales invalidas");
  const failsKey = staffLoginFailsKey(staff._id.toString());

  const fails = Number(await redisClient.get(failsKey)) || 0;
  if (fails >= STAFF_LOGIN_MAX_FAILS) {
    throw new Error("Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.");
  }

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) {
    // El plazo cuenta desde el ultimo fallo: el bloqueo se levanta solo pasados unos minutos.
    await redisClient.multi().incr(failsKey).expire(failsKey, STAFF_LOGIN_LOCK_SECONDS).exec();
    throw new Error("Credenciales invalidas");
  }
  // Despues de la contraseña: asi solo quien la sabe se entera de que la cuenta existe.
  if (staff.active === false) throw new Error("Esta cuenta esta desactivada. Habla con gestion.");

  await redisClient.del(failsKey);
  return { token: signStaffToken(staff), staff };
}

/** Token del personal; con actorId, el de una cuenta compartida con la persona que la usa. */
export function signStaffToken(account: Pick<StaffUserDoc, "_id" | "role">, actorId?: string) {
  return signToken({ sub: account._id.toString(), kind: "staff", role: account.role, ...(actorId ? { actor: actorId } : {}) });
}

export async function loginStaff(email: string, password: string) {
  return issueStaffToken(await StaffUser.findOne({ email: email.toLowerCase() }), password);
}

/** Login eligiendo la cuenta en la lista de la pantalla de acceso (sin escribir el email). */
export async function loginStaffById(id: string, password: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Credenciales invalidas");
  return issueStaffToken(await StaffUser.findById(id), password);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

/**
 * Contraseña olvidada: codigo de un solo uso al email de la cuenta, y con el una contraseña nueva.
 * La respuesta es la misma exista o no la cuenta (no se dice que emails son del personal).
 */
const STAFF_RESET_TTL_SECONDS = 15 * 60;
const STAFF_RESET_RESEND_SECONDS = 60;
const STAFF_RESET_MAX_ATTEMPTS = 5;
export const STAFF_PASSWORD_MIN_LENGTH = 8;

function staffResetKey(staffId: string) {
  return `staff-reset:${staffId}`;
}

/** La cuenta por su id (elegida en la lista) o por su email, solo si esta activa. */
async function findStaffForReset(target: { id?: string | null; email?: string | null }) {
  if (target.id) {
    if (!Types.ObjectId.isValid(target.id)) return null;
    return StaffUser.findOne({ _id: target.id, active: { $ne: false } });
  }
  const email = target.email?.trim().toLowerCase();
  return email ? StaffUser.findOne({ email, active: { $ne: false } }) : null;
}

/** "kate@gmail.com" -> "k***@gmail.com": para saber en que buzon mirar sin mostrarlo entero. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Envia el codigo y devuelve a que email (enmascarado). Por id (la lista de acceso ya muestra las
 * cuentas) dice null si la cuenta no tiene un email valido; por email responde siempre igual,
 * exista o no, para no desvelar que emails son del personal.
 */
export async function requestStaffPasswordReset(target: { id?: string | null; email?: string | null }) {
  const byEmail = !target.id;
  const typed = target.email?.trim().toLowerCase() ?? "";
  if (byEmail && !EMAIL_RE.test(typed)) throw new Error("Introduce un email valido");
  const answer = byEmail ? maskEmail(typed) : null;

  const staff = await findStaffForReset(target);
  if (!staff || !EMAIL_RE.test(staff.email)) return answer;
  const key = staffResetKey(staff._id.toString());

  // Un codigo por minuto como mucho: reenviar sin parar llenaria el buzon.
  const ttl = await redisClient.ttl(key);
  if (ttl > STAFF_RESET_TTL_SECONDS - STAFF_RESET_RESEND_SECONDS) {
    if (byEmail) return answer;
    throw new Error("Ya te hemos enviado un código hace un momento. Espera un minuto para pedir otro.");
  }

  const code = String(randomInt(100000, 999999));
  await redisClient.set(key, JSON.stringify({ code, attempts: 0 }), "EX", STAFF_RESET_TTL_SECONDS);
  if (env.nodeEnv !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[staff-reset] codigo para ${staff.email}: ${code}`);
  }

  const mailer = getTransporter();
  if (mailer) {
    const minutes = Math.round(STAFF_RESET_TTL_SECONDS / 60);
    try {
      await mailer.sendMail({
        from: env.smtpFrom,
        to: staff.email,
        subject: `Cambiar tu contraseña de La Quinta: ${code}`,
        text: `Hola, ${staff.name}. Tu codigo para poner una contraseña nueva en el panel de La Quinta es ${code}. Caduca en ${minutes} minutos. Si no lo has pedido tu, ignora este correo: tu contraseña no cambia.`,
        html: `<p>Hola, ${escapeHtml(staff.name)}.</p><p>Tu codigo para poner una contraseña nueva en el panel de <strong>La Quinta</strong> es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>Caduca en ${minutes} minutos. Si no lo has pedido tu, ignora este correo: tu contraseña no cambia.</p>`,
      });
    } catch {
      await redisClient.del(key);
      throw new Error("No se pudo enviar el correo con el codigo. Intentalo de nuevo en unos minutos.");
    }
  }
  return answer ?? maskEmail(staff.email);
}

/** Comprueba el codigo, guarda la contraseña nueva y abre sesion con la cuenta. */
export async function resetStaffPassword(
  target: { id?: string | null; email?: string | null },
  code: string,
  newPassword: string
) {
  if (newPassword.length < STAFF_PASSWORD_MIN_LENGTH) {
    throw new Error(`La contraseña tiene que tener al menos ${STAFF_PASSWORD_MIN_LENGTH} caracteres`);
  }
  const staff = await findStaffForReset(target);
  const key = staff ? staffResetKey(staff._id.toString()) : null;
  const stored = key ? await redisClient.get(key) : null;
  if (!staff || !key || !stored) throw new Error("Codigo invalido o caducado");

  const pending = JSON.parse(stored) as { code: string; attempts: number };
  if (pending.code !== code.trim()) {
    // Pocos intentos por codigo: con 6 cifras no se puede ir probando.
    if (pending.attempts + 1 >= STAFF_RESET_MAX_ATTEMPTS) await redisClient.del(key);
    else await redisClient.set(key, JSON.stringify({ ...pending, attempts: pending.attempts + 1 }), "KEEPTTL");
    throw new Error("Codigo invalido o caducado");
  }

  await redisClient.del(key);
  staff.passwordHash = await hashPassword(newPassword);
  await staff.save();
  // Si se habia bloqueado por fallos al entrar, el cambio lo desbloquea.
  await redisClient.del(staffLoginFailsKey(staff._id.toString()));
  return { token: signStaffToken(staff), staff };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
