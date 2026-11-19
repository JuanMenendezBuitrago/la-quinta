import { User } from "./model";

// Gmail no distingue los puntos de la parte local, y googlemail.com es el mismo buzon.
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Clave del buzon al que llega un email, para saber si ya hay una cuenta con el: sin la etiqueta
 * "+loquesea" y, en Gmail, sin puntos. Asi "ana+1@gmail.com" y "a.na@gmail.com" son el mismo
 * cliente y no se pueden abrir varias cuentas (y sellos) con el mismo correo.
 *
 * Solo sirve para comparar: el email que se guarda y al que se escribe es el que puso el cliente.
 */
export function emailKey(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "") || local;
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/** Calcula emailKey de los clientes anteriores a este campo. Idempotente. */
export async function backfillEmailKeys() {
  const pending = await User.find({ email: { $exists: true }, emailKey: { $exists: false } }).select("_id email").lean();
  for (const user of pending) {
    await User.updateOne({ _id: user._id }, { $set: { emailKey: emailKey(user.email!) } });
  }
  if (pending.length) console.log(`[users] emailKey calculada para ${pending.length} clientes`);
}
