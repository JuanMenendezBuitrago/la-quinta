import { Schema, model } from "mongoose";
import { DEFAULT_OPENING_HOURS, OpeningHoursDoc, TIME_PATTERN } from "./openingHours";

const openingHoursSchema = new Schema<OpeningHoursDoc>(
  {
    weekday: { type: Number, required: true, min: 1, max: 7 },
    open: { type: String, required: true, match: TIME_PATTERN },
    close: { type: String, required: true, match: TIME_PATTERN },
  },
  { _id: false }
);

export interface SiteSettingsDoc {
  address?: string;
  addressMapUrl?: string;
  // Un tramo por dia abierto; el dia que no aparece, la tienda esta cerrada. Las lineas de
  // horario del pie de pagina se generan a partir de aqui (ver scheduleLines).
  openingHours: OpeningHoursDoc[];
  phone?: string;
  email?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialTiktok?: string;
  socialWhatsapp?: string;
  // Responsable del tratamiento de datos (Ley 1581): los muestra la politica de privacidad.
  legalName?: string;
  taxId?: string;
  privacyEmail?: string;
  // Solo el personal crea pedidos: los clientes ven la carta y sus pedidos, pero no pueden pedir.
  staffOnlyOrders: boolean;
}

// Documento unico (singleton): siempre se lee/escribe con un findOneAndUpdate sin filtro,
// nunca por id (ver settings/resolvers.ts). Los valores por defecto son los que ya llevaba
// el footer a mano, para que activar esta seccion no cambie nada hasta que alguien lo edite.
const siteSettingsSchema = new Schema<SiteSettingsDoc>({
  address: { type: String, trim: true, default: "Calle 00 # 00-00\nBarrio Ejemplo, Ciudad" },
  addressMapUrl: { type: String, trim: true },
  openingHours: {
    type: [openingHoursSchema],
    default: () => DEFAULT_OPENING_HOURS.map((h) => ({ ...h })),
  },
  phone: { type: String, trim: true, default: "+57 300 000 0000" },
  email: { type: String, trim: true, default: "hola@laquinta.example" },
  socialInstagram: { type: String, trim: true },
  socialFacebook: { type: String, trim: true },
  socialTiktok: { type: String, trim: true },
  socialWhatsapp: { type: String, trim: true },
  legalName: { type: String, trim: true },
  taxId: { type: String, trim: true },
  privacyEmail: { type: String, trim: true, lowercase: true },
  staffOnlyOrders: { type: Boolean, default: false },
});

export const SiteSettings = model<SiteSettingsDoc>("SiteSettings", siteSettingsSchema);
