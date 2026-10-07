export const newsletterTypeDefs = /* GraphQL */ `
  enum NewsletterCampaignStatus {
    ENVIANDO
    ENVIADA
    """Se corto a medias (p. ej. se reinicio el servidor): sentCount dice hasta donde llego."""
    INTERRUMPIDA
  }

  type NewsletterCampaign {
    id: ID!
    subject: String!
    body: String!
    status: NewsletterCampaignStatus!
    recipients: Int!
    sentCount: Int!
    failedCount: Int!
    createdByName: String
    createdAt: String!
    finishedAt: String
  }

  type NewsletterOverview {
    """Clientes con email que han autorizado recibir novedades."""
    subscriberCount: Int!
    """Ultimos envios, mas recientes primero."""
    campaigns: [NewsletterCampaign!]!
  }

  extend type Customer {
    """Si ha autorizado recibir novedades por email (ofertas, eventos)."""
    newsletterSubscribed: Boolean!
  }

  extend type Query {
    """Suscriptores y envios de novedades (requiere rol gestion)."""
    newsletterOverview: NewsletterOverview!
  }

  extend type Mutation {
    """El cliente autoriza o retira la autorizacion para recibir novedades. Requiere email."""
    setMyNewsletterSubscription(subscribed: Boolean!): Customer!
    """Baja desde el enlace del correo, sin sesion. Idempotente."""
    unsubscribeNewsletter(userId: ID!, token: String!): Boolean!
    """Envia el correo solo al email del miembro del equipo, para revisarlo (gestion)."""
    sendNewsletterTest(subject: String!, body: String!): Boolean!
    """Envia el correo a todos los suscriptores, en segundo plano (gestion)."""
    sendNewsletter(subject: String!, body: String!): NewsletterCampaign!
  }
`;
