import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

// Transporter perezoso y reutilizado entre peticiones: crearlo abre la conexion SMTP, no hace
// falta una por cada correo. Lo comparten el codigo de acceso y las novedades.
let transporter: Transporter | null = null;

/** null si no hay SMTP_URL (desarrollo): quien lo use decide que hacer sin correo. */
export function getTransporter(): Transporter | null {
  if (!env.smtpUrl) return null;
  if (!transporter) transporter = nodemailer.createTransport(env.smtpUrl);
  return transporter;
}
