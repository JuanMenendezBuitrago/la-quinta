export const usersTypeDefs = /* GraphQL */ `
  type Customer {
    id: ID!
    name: String!
    email: String
    phone: String
    customerCode: String!
  }

  type Staff {
    id: ID!
    name: String!
    email: String!
    role: StaffRole!
  }

  enum StaffRole {
    barra
    gestion
  }

  type AuthPayload {
    token: String!
    customer: Customer!
  }

  """Lo que hay que pedir en el paso del codigo del login."""
  type LoginRequirements {
    """Cliente nuevo: se le pide el nombre."""
    askName: Boolean!
    """Cliente nuevo o sin autorizacion para la version vigente de la politica de datos."""
    askPrivacyConsent: Boolean!
  }

  type StaffAuthPayload {
    token: String!
    staff: Staff!
  }

  extend type Query {
    """Cliente autenticado actualmente (null si no hay sesion)."""
    me: Customer
    """Miembro del equipo autenticado actualmente (null si no hay sesion)."""
    myStaffProfile: Staff
    """Listado de personal del local (requiere rol gestion)."""
    staffUsers: [Staff!]!
    """Que datos pedir en el login a ese email/telefono (nombre, autorizacion de datos)."""
    loginRequirements(identifier: String!): LoginRequirements!
  }

  extend type Mutation {
    """Paso 1 del login: envia un codigo de un solo uso a email o telefono."""
    requestOtp(identifier: String!): Boolean!
    """Paso 2 del login: valida el codigo y devuelve un token de sesion. acceptPrivacyPolicy es
    obligatorio (true) si loginRequirements pidio la autorizacion."""
    verifyOtp(identifier: String!, code: String!, name: String, acceptPrivacyPolicy: Boolean): AuthPayload!
    """Derecho de actualizacion: el cliente corrige su nombre."""
    updateMyProfile(name: String!): Customer!
    """Login del equipo del local (usuario/contraseña)."""
    staffLogin(email: String!, password: String!): StaffAuthPayload!
    """Alta de personal (requiere rol gestion)."""
    createStaffUser(name: String!, email: String!, password: String!, role: StaffRole!): Staff!
    """Edicion de personal: nombre, rol y/o contraseña (requiere rol gestion)."""
    updateStaffUser(id: ID!, name: String, role: StaffRole, password: String): Staff!
  }
`;
