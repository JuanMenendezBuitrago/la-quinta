import { Schema, model, Types } from "mongoose";

export type CampaignStatus = "ENVIANDO" | "ENVIADA" | "INTERRUMPIDA";

/** Un envio de novedades a los suscriptores: lo que se mando, a cuantos y como fue. */
export interface NewsletterCampaignDoc {
  _id: Types.ObjectId;
  subject: string;
  body: string;
  status: CampaignStatus;
  recipients: number; // suscriptores al empezar
  sentCount: number;
  failedCount: number;
  createdByStaffId: Types.ObjectId;
  createdAt: Date;
  finishedAt?: Date;
}

const campaignSchema = new Schema<NewsletterCampaignDoc>({
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  body: { type: String, required: true, maxlength: 10000 },
  status: { type: String, enum: ["ENVIANDO", "ENVIADA", "INTERRUMPIDA"], default: "ENVIANDO" },
  recipients: { type: Number, required: true },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdByStaffId: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true },
  createdAt: { type: Date, default: () => new Date() },
  finishedAt: { type: Date },
});

export const NewsletterCampaign = model<NewsletterCampaignDoc>("NewsletterCampaign", campaignSchema);

/**
 * Un envio que estaba en curso cuando se reinicio la API no sigue solo: se marca como
 * interrumpido (con lo que llego a enviar) para que no bloquee nuevos envios.
 */
export async function markInterruptedCampaigns() {
  const result = await NewsletterCampaign.updateMany(
    { status: "ENVIANDO" },
    { $set: { status: "INTERRUMPIDA", finishedAt: new Date() } }
  );
  if (result.modifiedCount) console.log(`[newsletter] ${result.modifiedCount} envios interrumpidos por el reinicio`);
}
