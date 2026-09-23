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

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  customerCode: string; // codigo corto que el cliente enseña en el mostrador
  privacyConsent?: PrivacyConsentDoc;
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
  privacyConsent: {
    type: new Schema<PrivacyConsentDoc>(
      { acceptedAt: { type: Date, required: true }, policyVersion: { type: String, required: true } },
      { _id: false }
    ),
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
  createdAt: Date;
}

const staffUserSchema = new Schema<StaffUserDoc>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["barra", "gestion"], required: true, default: "barra" },
  createdAt: { type: Date, default: () => new Date() },
});

export const StaffUser = model<StaffUserDoc>("StaffUser", staffUserSchema);
