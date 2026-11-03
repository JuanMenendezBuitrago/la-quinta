export const shiftsTypeDefs = /* GraphQL */ `
  """Turno de trabajo. Fecha y horas en hora de la tienda; no cruza la medianoche."""
  type Shift {
    id: ID!
    staffId: ID!
    staffName: String!
    staffAvatar: String
    """YYYY-MM-DD"""
    date: String!
    """HH:mm"""
    start: String!
    """HH:mm, posterior a start."""
    end: String!
    note: String
    updatedByName: String!
  }

  input ShiftInput {
    staffId: ID!
    date: String!
    start: String!
    end: String!
    note: String
  }

  extend type Query {
    """Personal: turnos entre dos fechas (YYYY-MM-DD, ambas incluidas; como mucho 62 dias)."""
    shifts(from: String!, to: String!): [Shift!]!
  }

  extend type Mutation {
    """Gestion: crea un turno igual en cada una de las fechas (para repetirlo varios dias de golpe)."""
    createShifts(input: ShiftInput!, dates: [String!]!): [Shift!]!
    """Gestion: cambia un turno."""
    updateShift(id: ID!, input: ShiftInput!): Shift!
    """Gestion: borra un turno."""
    deleteShift(id: ID!): Boolean!
    """Gestion: copia los turnos de la semana que empieza en fromMonday a la de toMonday. Se salta
    los que se pisarian con uno que ya exista. Devuelve cuantos se copiaron."""
    copyShiftsWeek(fromMonday: String!, toMonday: String!): Int!
  }
`;
