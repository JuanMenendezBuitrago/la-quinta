import { Schema, model } from "mongoose";

export interface ScheduleLineDoc {
  label: string;
  hours: string;
}

const scheduleLineSchema = new Schema<ScheduleLineDoc>(
  {
    label: { type: String, required: true, trim: true },
    hours: { type: String, required: true, trim: true },
  },
  { _id: false }
);

export interface SiteSettingsDoc {
  address?: string;
  addressMapUrl?: string;
  schedule: ScheduleLineDoc[];
  phone?: string;
  email?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialTiktok?: string;
  socialWhatsapp?: string;
}

// Documento unico (singleton): siempre se lee/escribe con un findOneAndUpdate sin filtro,
// nunca por id (ver settings/resolvers.ts). Los valores por defecto son los que ya llevaba
// el footer a mano, para que activar esta seccion no cambie nada hasta que alguien lo edite.
const siteSettingsSchema = new Schema<SiteSettingsDoc>({
  address: { type: String, trim: true, default: "Calle 00 # 00-00\nBarrio Ejemplo, Ciudad" },
  addressMapUrl: { type: String, trim: true },
  schedule: {
    type: [scheduleLineSchema],
    default: () => [
      { label: "Lun – Vie", hours: "7:00 – 19:00" },
      { label: "Sábados", hours: "8:00 – 20:00" },
      { label: "Domingos", hours: "8:00 – 15:00" },
    ],
  },
  phone: { type: String, trim: true, default: "+57 300 000 0000" },
  email: { type: String, trim: true, default: "hola@laquinta.example" },
  socialInstagram: { type: String, trim: true },
  socialFacebook: { type: String, trim: true },
  socialTiktok: { type: String, trim: true },
  socialWhatsapp: { type: String, trim: true },
});

export const SiteSettings = model<SiteSettingsDoc>("SiteSettings", siteSettingsSchema);
