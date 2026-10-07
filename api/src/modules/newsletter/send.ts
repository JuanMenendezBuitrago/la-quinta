import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import { getTransporter } from "../../config/mailer";
import { User } from "../users/model";
import { NewsletterCampaign } from "./model";

// Pausa entre correos: Gmail limita el ritmo de envio de una cuenta (y ~2000 al dia en Workspace).
const DELAY_BETWEEN_EMAILS_MS = 1500;

/** Quien recibe novedades: con email, autorizacion vigente y cuenta no suprimida. */
export const SUBSCRIBER_FILTER = {
  email: { $exists: true, $ne: null },
  newsletterConsent: { $exists: true },
  deletedAt: { $exists: false },
};

/**
 * Firma del enlace para darse de baja: permite hacerlo sin iniciar sesion (desde el propio correo)
 * sin que nadie pueda dar de baja a otro cambiando el id. No caduca, como exige un enlace de baja.
 */
export function unsubscribeToken(userId: string) {
  return createHmac("sha256", env.jwtSecret).update(`newsletter-unsubscribe:${userId}`).digest("base64url");
}

export function isValidUnsubscribeToken(userId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(userId: string) {
  return `${env.publicSiteUrl}/baja?u=${userId}&t=${unsubscribeToken(userId)}`;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** El cuerpo se escribe como texto: las lineas en blanco separan parrafos. */
export function buildNewsletterEmail(subject: string, body: string, userId: string | null) {
  const paragraphs = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const link = userId ? unsubscribeUrl(userId) : `${env.publicSiteUrl}/cuenta`;
  const footer =
    "Recibes este correo porque pediste recibir las novedades de La Quinta. " +
    "Puedes darte de baja cuando quieras:";
  const text = `${paragraphs.join("\n\n")}\n\n--\n${footer} ${link}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#5b4632;line-height:1.5">
<h1 style="font-size:22px;color:#9f714d">${escapeHtml(subject)}</h1>
${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
<hr style="border:none;border-top:1px solid #e5dcc3;margin:28px 0 12px">
<p style="font-size:12px;color:#9b8533">${footer} <a href="${link}" style="color:#9b8533">darme de baja</a>.</p>
</div>`;
  return {
    subject,
    text,
    html,
    // Los clientes de correo muestran su propio boton de "darse de baja" con esta cabecera.
    headers: userId ? { "List-Unsubscribe": `<${link}>` } : undefined,
  };
}

export async function sendNewsletterEmail(to: string, subject: string, body: string, userId: string | null) {
  const mailer = getTransporter();
  const email = buildNewsletterEmail(subject, body, userId);
  if (!mailer) {
    // Sin SMTP (desarrollo): como el codigo de acceso, se queda en los logs.
    console.log(`[newsletter] (sin SMTP) a ${to}: ${subject}`);
    return;
  }
  await mailer.sendMail({ from: env.smtpFrom, to, ...email });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia la campaña uno a uno (cada correo lleva su propio enlace de baja) y va guardando el
 * progreso. Corre en segundo plano: la mutacion que la lanza responde en seguida.
 */
export async function runCampaign(campaignId: string) {
  const campaign = await NewsletterCampaign.findById(campaignId);
  if (!campaign) return;
  const subscribers = User.find(SUBSCRIBER_FILTER).select("_id email").lean().cursor();
  try {
    for await (const user of subscribers) {
      // Se comprueba de nuevo: pudo darse de baja mientras se enviaba a los anteriores.
      const stillSubscribed = await User.exists({ _id: user._id, ...SUBSCRIBER_FILTER });
      if (!stillSubscribed) continue;
      try {
        await sendNewsletterEmail(user.email!, campaign.subject, campaign.body, user._id.toString());
        await NewsletterCampaign.updateOne({ _id: campaign._id }, { $inc: { sentCount: 1 } });
      } catch (err) {
        console.error(`[newsletter] fallo el envio a ${user._id}:`, (err as Error).message);
        await NewsletterCampaign.updateOne({ _id: campaign._id }, { $inc: { failedCount: 1 } });
      }
      await wait(DELAY_BETWEEN_EMAILS_MS);
    }
    await NewsletterCampaign.updateOne({ _id: campaign._id }, { $set: { status: "ENVIADA", finishedAt: new Date() } });
  } catch (err) {
    console.error("[newsletter] envio interrumpido:", (err as Error).message);
    await NewsletterCampaign.updateOne({ _id: campaign._id }, { $set: { status: "INTERRUMPIDA", finishedAt: new Date() } });
  }
}
