import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { env } from "../../config/env";
import { redisClient } from "../../config/redis";
import { User, StaffUser, StaffRole } from "./model";

// Transporter perezoso y reutilizado entre peticiones: crearlo abre la conexion SMTP,
// no hace falta una por cada codigo enviado.
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.smtpUrl) return null;
  if (!transporter) transporter = nodemailer.createTransport(env.smtpUrl);
  return transporter;
}

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

function otpKey(identifier: string) {
  return `otp:${identifier.toLowerCase()}`;
}

function generateCustomerCode() {
  return `LQ-${randomInt(1000, 9999)}`;
}

/** Mismo criterio email/telefono usado para buscar o crear el cliente en verifyOtpAndIssueToken. */
function customerLookupQuery(identifier: string) {
  const isEmail = identifier.includes("@");
  return isEmail ? { email: identifier.toLowerCase() } : { phone: identifier };
}

/** Si ya existe cuenta con ese identificador (para no volver a pedir el nombre en el login). */
export async function findExistingCustomer(identifier: string) {
  return User.findOne(customerLookupQuery(identifier)).select("_id").lean();
}

/**
 * Genera un codigo de un solo uso y lo guarda en Redis con caducidad.
 * Envio real solo para email (ver sendOtpEmail); SMS se deja como punto de extension.
 * En desarrollo el codigo tambien se imprime en consola, para poder probar el flujo
 * aunque SMTP_URL no este configurada todavia.
 */
export async function requestOtp(identifier: string): Promise<void> {
  const code = String(randomInt(100000, 999999));
  await redisClient.set(otpKey(identifier), code, "EX", env.otpTtlSeconds);

  if (env.nodeEnv !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[otp] codigo para ${identifier}: ${code} (valido ${env.otpTtlSeconds}s)`);
  }

  const isEmail = identifier.includes("@");
  if (env.otpChannel === "email" && isEmail) {
    await sendOtpEmail(identifier, code);
  }
  // TODO: integrar SMS cuando env.otpChannel === "sms"
}

export async function verifyOtpAndIssueToken(
  identifier: string,
  code: string,
  name?: string
): Promise<{ token: string; user: InstanceType<typeof User> }> {
  const stored = await redisClient.get(otpKey(identifier));
  if (!stored || stored !== code) {
    throw new Error("Codigo invalido o caducado");
  }
  await redisClient.del(otpKey(identifier));

  const query = customerLookupQuery(identifier);

  let user = await User.findOne(query);
  if (!user) {
    user = await User.create({
      ...query,
      name: name?.trim() || "Cliente La Quinta",
      customerCode: generateCustomerCode(),
    });
  }

  const token = signToken({ sub: user._id.toString(), kind: "customer" });
  return { token, user };
}

export async function loginStaff(email: string, password: string) {
  const staff = await StaffUser.findOne({ email: email.toLowerCase() });
  if (!staff) throw new Error("Credenciales invalidas");

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) throw new Error("Credenciales invalidas");

  const token = signToken({ sub: staff._id.toString(), kind: "staff", role: staff.role });
  return { token, staff };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
