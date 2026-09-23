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
    """Si ya existe una cuenta de cliente con ese email/telefono (para no pedir el nombre
    de nuevo a quien ya se registro la primera vez)."""
    customerExists(identifier: String!): Boolean!
  }

  extend type Mutation {
    """Paso 1 del login: envia un codigo de un solo uso a email o telefono."""
    requestOtp(identifier: String!): Boolean!
    """Paso 2 del login: valida el codigo y devuelve un token de sesion."""
    verifyOtp(identifier: String!, code: String!, name: String): AuthPayload!
    """Login del equipo del local (usuario/contraseña)."""
    staffLogin(email: String!, password: String!): StaffAuthPayload!
    """Alta de personal (requiere rol gestion)."""
    createStaffUser(name: String!, email: String!, password: String!, role: StaffRole!): Staff!
    """Edicion de personal: nombre, rol y/o contraseña (requiere rol gestion)."""
    updateStaffUser(id: ID!, name: String, role: StaffRole, password: String): Staff!
  }
`;
