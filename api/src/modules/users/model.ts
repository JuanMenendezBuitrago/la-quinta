import { Schema, model, Types } from "mongoose";

/**
 * Version vigente de la politica de tratamiento de datos (fecha de entrada en vigencia).
 * Debe coincidir con la que muestra web/pages/privacidad.vue: si se cambia la politica,
 * se actualizan las dos y a cada cliente se le vuelve a pedir la autorizacion al entrar.
 */
export const PRIVACY_POLICY_VERSION = "2026-09-23";

/** Prueba de la autorizacion del titular (Ley 1581 de 2012, art. 9; Decreto 1377, art. 7). */
export interface PrivacyConsentDoc {
  acceptedAt: Date;
  policyVersion: string;
}

/**
 * Autorizacion aparte, opcional y revocable, para recibir novedades por email (ofertas, eventos).
 * No forma parte de la autorizacion general: sin ella la cuenta funciona igual.
 */
export interface NewsletterConsentDoc {
  acceptedAt: Date;
}

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  customerCode: string; // codigo corto que el cliente enseña en el mostrador
  avatar?: string; // ver avatar.ts
  favoriteMenuItemIds: Types.ObjectId[]; // productos de la carta marcados como favoritos
  privacyConsent?: PrivacyConsentDoc;
  newsletterConsent?: NewsletterConsentDoc;
  // Cuenta suprimida a peticion del titular: se anonimiza (sin nombre, email ni telefono) pero
  // el documento se conserva para que sus pedidos, que hay que guardar por obligaciones
  // contables, sigan apuntando a un cliente. Ver modules/privacy.
  deletedAt?: Date;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  customerCode: { type: String, required: true, unique: true },
  avatar: { type: String },
  favoriteMenuItemIds: { type: [{ type: Schema.Types.ObjectId, ref: "MenuItem" }], default: [] },
  privacyConsent: {
    type: new Schema<PrivacyConsentDoc>(
      { acceptedAt: { type: Date, required: true }, policyVersion: { type: String, required: true } },
      { _id: false }
    ),
  },
  newsletterConsent: {
    type: new Schema<NewsletterConsentDoc>({ acceptedAt: { type: Date, required: true } }, { _id: false }),
  },
  deletedAt: { type: Date },
  createdAt: { type: Date, default: () => new Date() },
});

export function hasCurrentConsent(user: Pick<UserDoc, "privacyConsent">) {
  return user.privacyConsent?.policyVersion === PRIVACY_POLICY_VERSION;
}

export const User = model<UserDoc>("User", userSchema);

export type StaffRole = "barra" | "gestion";

export interface StaffUserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  avatar?: string; // ver avatar.ts
  // Cuenta desactivada (quien ya no trabaja en el local): no sale en la pantalla de acceso, no
  // puede entrar y su sesion abierta deja de valer. Se desactiva en vez de borrar para no perder
  // el rastro de quien hizo cada ajuste de sellos o canje.
  active: boolean;
  // Cuenta compartida (p. ej. "Gestion La Quinta"): al entrar se elige quien la esta usando, y lo
  // que se hace queda a nombre de esa persona (ver "actor" en el token, users/auth.ts).
  shared: boolean;
  createdAt: Date;
}

const staffUserSchema = new Schema<StaffUserDoc>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["barra", "gestion"], required: true, default: "barra" },
  avatar: { type: String },
  // Las cuentas creadas antes de existir este campo no lo tienen: en las consultas se filtra con
  // { active: { $ne: false } } para contarlas como activas.
  active: { type: Boolean, default: true },
  shared: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
});

export const StaffUser = model<StaffUserDoc>("StaffUser", staffUserSchema);
