export const settingsTypeDefs = /* GraphQL */ `
  type ScheduleLine {
    label: String!
    hours: String!
  }

  input ScheduleLineInput {
    label: String!
    hours: String!
  }

  """Datos de contacto/redes que muestra el pie de pagina en toda la web."""
  type SiteSettings {
    address: String
    """URL del enlace "Cómo llegar" (Google Maps u otro). Sin ella, el enlace no se muestra."""
    addressMapUrl: String
    schedule: [ScheduleLine!]!
    phone: String
    email: String
    """URL de cada red social. Vacia/null = ese icono no se muestra en el pie de pagina."""
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
  }

  input SiteSettingsInput {
    address: String
    addressMapUrl: String
    schedule: [ScheduleLineInput!]
    phone: String
    email: String
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
  }

  extend type Query {
    """Publica: la usa el pie de pagina en toda la web, sin necesitar sesion."""
    siteSettings: SiteSettings!
  }

  extend type Mutation {
    """Requiere rol gestion. Solo actualiza los campos presentes en el input."""
    updateSiteSettings(input: SiteSettingsInput!): SiteSettings!
  }
`;
