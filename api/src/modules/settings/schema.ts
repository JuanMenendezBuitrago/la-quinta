export const settingsTypeDefs = /* GraphQL */ `
  type ScheduleLine {
    label: String!
    hours: String!
  }

  """Horario de un dia de la semana, en hora de la tienda."""
  type OpeningHours {
    """1 = lunes ... 7 = domingo."""
    weekday: Int!
    """HH:MM"""
    open: String!
    """HH:MM"""
    close: String!
  }

  input OpeningHoursInput {
    weekday: Int!
    open: String!
    close: String!
  }

  """Datos de contacto/redes que muestra el pie de pagina en toda la web."""
  type SiteSettings {
    address: String
    """URL del enlace "Cómo llegar" (Google Maps u otro). Sin ella, el enlace no se muestra."""
    addressMapUrl: String
    """Dias abiertos; el dia que no aparece, la tienda esta cerrada. Limita las horas de recogida."""
    openingHours: [OpeningHours!]!
    """Lineas para mostrar, generadas a partir de openingHours ("Lun – Vie", "7:00 – 19:00")."""
    schedule: [ScheduleLine!]!
    phone: String
    email: String
    """URL de cada red social. Vacia/null = ese icono no se muestra en el pie de pagina."""
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
    """Responsable del tratamiento de datos: razon social o nombre del titular del negocio."""
    legalName: String
    """NIT o cedula del responsable."""
    taxId: String
    """Email donde los clientes ejercen sus derechos sobre sus datos (si falta, se usa email)."""
    privacyEmail: String
  }

  input SiteSettingsInput {
    address: String
    addressMapUrl: String
    openingHours: [OpeningHoursInput!]
    phone: String
    email: String
    socialInstagram: String
    socialFacebook: String
    socialTiktok: String
    socialWhatsapp: String
    legalName: String
    taxId: String
    privacyEmail: String
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
