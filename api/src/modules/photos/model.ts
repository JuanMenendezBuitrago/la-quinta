import fs from "fs/promises";
import path from "path";
import { Schema, model, Types } from "mongoose";

/**
 * Foto que un cliente hace de un producto de un pedido suyo entregado. Entra pendiente; gestion la
 * aprueba (sale en la ficha del producto, y puede ser su foto principal) o la rechaza (el archivo
 * se borra y queda solo el registro, que cuenta para los limites).
 */
export type PhotoStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA";
export const PHOTO_STATUSES: PhotoStatus[] = ["PENDIENTE", "APROBADA", "RECHAZADA"];

export interface CustomerPhotoDoc {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId: Types.ObjectId;
  menuItemId: Types.ObjectId;
  menuItemName: string; // snapshot, como en las lineas del pedido
  url?: string; // sin valor una vez rechazada (el archivo se borra)
  status: PhotoStatus;
  rejectReason?: string;
  // Autorizacion del cliente para publicarla con su nombre e inicial (Ley 1581).
  consentAt: Date;
  consentVersion: string;
  reviewedByStaffId?: Types.ObjectId;
  reviewedAt?: Date;
  // Si esta foto dio el sello de "foto aprobada" (uno por producto y pedido).
  stampAwarded: boolean;
  // Copia en /uploads/ hecha al elegirla como foto principal del producto (ver moderateProductPhoto).
  // Sigue siendo la principal mientras el producto tenga esa misma imagen: si gestion la cambia en
  // Carta o elige otra, deja de serlo sin tocar nada aqui.
  mainCopyUrl?: string;
  createdAt: Date;
}

export const PHOTO_UPLOAD_PREFIX = "/uploads/photos/";
// Version del texto de autorizacion que acepta el cliente al enviar (ver ProductPhotoUpload.vue).
export const PHOTO_CONSENT_VERSION = "2026-10-26";
// Que se puede enviar: productos de pedidos entregados hace menos de esto, con estos limites.
export const PHOTO_ORDER_MAX_AGE_DAYS = 30;
export const PHOTOS_PER_ORDER_ITEM = 3;
export const MAX_PENDING_PHOTOS = 10;
export const PHOTO_REJECT_REASON_MAX = 200;

const customerPhotoSchema = new Schema<CustomerPhotoDoc>({
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
  menuItemName: { type: String, required: true },
  url: { type: String },
  status: { type: String, enum: PHOTO_STATUSES, default: "PENDIENTE" },
  rejectReason: { type: String, trim: true, maxlength: PHOTO_REJECT_REASON_MAX },
  consentAt: { type: Date, required: true },
  consentVersion: { type: String, required: true },
  reviewedByStaffId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  reviewedAt: { type: Date },
  stampAwarded: { type: Boolean, default: false },
  mainCopyUrl: { type: String },
  createdAt: { type: Date, default: () => new Date() },
});

// Galeria de un producto (aprobadas, recientes primero) y bandeja de moderacion por estado.
customerPhotoSchema.index({ menuItemId: 1, status: 1, createdAt: -1 });
customerPhotoSchema.index({ status: 1, createdAt: -1 });

export const CustomerPhoto = model<CustomerPhotoDoc>("CustomerPhoto", customerPhotoSchema);

/** Borra del disco el archivo de una foto de cliente. Nunca lanza (como removeAvatarFile). */
export async function removePhotoFile(url: string | null | undefined, uploadDir: string) {
  if (!url?.startsWith(PHOTO_UPLOAD_PREFIX)) return;
  try {
    await fs.unlink(path.join(uploadDir, "photos", path.basename(url)));
  } catch {
    // ya no existia
  }
}
