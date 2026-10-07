import { isValidObjectId } from "mongoose";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { StaffUser, User } from "../users/model";
import { NewsletterCampaign } from "./model";
import { SUBSCRIBER_FILTER, isValidUnsubscribeToken, runCampaign, sendNewsletterEmail } from "./send";

function validateContent(subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (!s) throw new Error("Escribe el asunto");
  if (s.length > 150) throw new Error("El asunto es demasiado largo (máximo 150 caracteres)");
  if (!b) throw new Error("Escribe el mensaje");
  if (b.length > 10000) throw new Error("El mensaje es demasiado largo");
  return { subject: s, body: b };
}

export const newsletterResolvers = {
  Customer: {
    newsletterSubscribed: (doc: any) => !!doc.newsletterConsent,
  },
  NewsletterCampaign: {
    id: (doc: any) => doc._id.toString(),
    createdAt: (doc: any) => new Date(doc.createdAt).toISOString(),
    finishedAt: (doc: any) => (doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null),
    createdByName: async (doc: any) =>
      (await StaffUser.findById(doc.createdByStaffId).select("name").lean())?.name ?? null,
  },
  Query: {
    newsletterOverview: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const [subscriberCount, campaigns] = await Promise.all([
        User.countDocuments(SUBSCRIBER_FILTER),
        NewsletterCampaign.find().sort({ createdAt: -1 }).limit(20).lean(),
      ]);
      return { subscriberCount, campaigns };
    },
  },
  Mutation: {
    setMyNewsletterSubscription: async (_: unknown, args: { subscribed: boolean }, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const user = await User.findOne({ _id: customerId, deletedAt: { $exists: false } });
      if (!user) throw new Error("Cuenta no encontrada");
      if (args.subscribed) {
        if (!user.email) throw new Error("Para recibir novedades necesitas una cuenta con email");
        // Se conserva la fecha original si ya estaba suscrito: es la prueba de la autorizacion.
        if (!user.newsletterConsent) user.newsletterConsent = { acceptedAt: new Date() };
      } else {
        user.newsletterConsent = undefined;
      }
      await user.save();
      return user;
    },
    unsubscribeNewsletter: async (_: unknown, args: { userId: string; token: string }) => {
      if (!isValidObjectId(args.userId) || !isValidUnsubscribeToken(args.userId, args.token)) {
        throw new Error("El enlace para darte de baja no es válido");
      }
      await User.updateOne({ _id: args.userId }, { $unset: { newsletterConsent: 1 } });
      return true;
    },
    sendNewsletterTest: async (_: unknown, args: { subject: string; body: string }, ctx: GraphQLContext) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const { subject, body } = validateContent(args.subject, args.body);
      const me = await StaffUser.findById(staff.id).select("email").lean();
      if (!me?.email) throw new Error("Tu usuario no tiene email");
      try {
        await sendNewsletterEmail(me.email, `[Prueba] ${subject}`, body, null);
      } catch {
        throw new Error("No se pudo enviar el correo de prueba. Inténtalo de nuevo en unos minutos.");
      }
      return true;
    },
    sendNewsletter: async (_: unknown, args: { subject: string; body: string }, ctx: GraphQLContext) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const { subject, body } = validateContent(args.subject, args.body);
      if (await NewsletterCampaign.exists({ status: "ENVIANDO" })) {
        throw new Error("Ya hay un envío en curso: espera a que termine");
      }
      const recipients = await User.countDocuments(SUBSCRIBER_FILTER);
      if (!recipients) throw new Error("Todavía no hay clientes suscritos a las novedades");
      const campaign = await NewsletterCampaign.create({ subject, body, recipients, createdByStaffId: staff.id });
      // En segundo plano: con la pausa entre correos, un envio grande tarda minutos.
      void runCampaign(campaign._id.toString());
      return campaign;
    },
  },
};
