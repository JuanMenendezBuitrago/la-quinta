export const heroTypeDefs = /* GraphQL */ `
  enum HeroTone {
    teal
    brown
    olive
  }

  """Diapositiva de la portada de la carta (ofertas, eventos, novedades...)."""
  type HeroSlide {
    id: ID!
    tag: String!
    title: String!
    text: String
    tone: HeroTone!
    linkUrl: String
    linkLabel: String
    """Primer dia en que se muestra (YYYY-MM-DD, calendario de la tienda). Null: sin limite."""
    startDate: String
    """Ultimo dia en que se muestra (incluido). Null: sin limite."""
    endDate: String
    active: Boolean!
    position: Int!
  }

  input HeroSlideInput {
    tag: String!
    title: String!
    text: String
    tone: HeroTone!
    """https://... o una ruta de la web que empiece por / (p. ej. /cuenta)."""
    linkUrl: String
    linkLabel: String
    startDate: String
    endDate: String
    active: Boolean!
  }

  enum MoveDirection {
    UP
    DOWN
  }

  extend type Query {
    """Publica: diapositivas activas y vigentes hoy, en orden."""
    heroSlides: [HeroSlide!]!
    """Gestion: todas, incluidas las ocultas, programadas y caducadas."""
    allHeroSlides: [HeroSlide!]!
  }

  extend type Mutation {
    createHeroSlide(input: HeroSlideInput!): HeroSlide!
    updateHeroSlide(id: ID!, input: HeroSlideInput!): HeroSlide!
    deleteHeroSlide(id: ID!): Boolean!
    """Intercambia la posicion con la diapositiva anterior o siguiente."""
    moveHeroSlide(id: ID!, direction: MoveDirection!): [HeroSlide!]!
  }
`;
