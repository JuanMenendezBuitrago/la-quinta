export const usersTypeDefs = /* GraphQL */ `
  type Customer {
    id: ID!
    name: String!
    email: String
    phone: String
    customerCode: String!
    """"preset:<id>" o ruta de una foto subida (/uploads/avatars/...); null: sin avatar."""
    avatar: String
  }

  type Staff {
    id: ID!
    name: String!
    email: String!
    role: StaffRole!
    avatar: String
    """Desactivada: no sale en la pantalla de acceso ni puede entrar."""
    active: Boolean!
    """Se puede borrar: no tiene pedidos ni otros registros a su nombre (si los tiene, se desactiva)."""
    deletable: Boolean!
    """Cuenta compartida (p. ej. "Gestion La Quinta"): al entrar se elige quien la usa (setActingStaff)."""
    shared: Boolean!
    """Solo en myStaffProfile de una cuenta compartida: quien la esta usando (null si aun no se eligio).
    Lo que se hace queda a su nombre; los permisos son los de la cuenta."""
    actingAs: Staff
  }

  enum StaffRole {
    barra
    gestion
  }

  type AuthPayload {
    token: String!
    customer: Customer!
  }

  """Datos minimos de un cliente para asociarlo a un pedido desde el panel (sin contacto)."""
  type CustomerMatch {
    id: ID!
    name: String!
    customerCode: String!
    avatar: String
  }

  """Lo que hay que pedir en el paso del codigo del login."""
  type LoginRequirements {
    """Cliente nuevo: se le pide el nombre."""
    askName: Boolean!
    """Cliente nuevo o sin autorizacion para la version vigente de la politica de datos."""
    askPrivacyConsent: Boolean!
  }

  """Cuenta del personal tal como se muestra en la pantalla de acceso: sin email ni rol."""
  type StaffLoginOption {
    id: ID!
    name: String!
    avatar: String
  }

  type StaffAuthPayload {
    token: String!
    staff: Staff!
  }

  extend type Query {
    """Cliente autenticado actualmente (null si no hay sesion)."""
    me: Customer
"""Ids de los productos favoritos del cliente con sesion (vacio sin sesion de cliente)."""
    myFavoriteMenuItemIds: [ID!]!
    """Miembro del equipo autenticado actualmente (null si no hay sesion)."""
    myStaffProfile: Staff
    """Personal (barra y gestion): busca un cliente por su codigo, telefono o email EXACTOS, para
    asociarlo a un pedido. No lista ni busca por partes: el listado de clientes es solo de gestion."""
    lookupCustomer(query: String!): CustomerMatch
    """Personal (barra y gestion): clientes para asociar a un pedido. Codigo, telefono o email exactos
    (como lookupCustomer) o, si no, parte del nombre (minimo 3 letras, sin distinguir tildes ni
    mayusculas). Como mucho 8, por nombre."""
    searchCustomers(query: String!): [CustomerMatch!]!
    """Publico: cuentas del personal para elegir en la pantalla de acceso (nombre y avatar)."""
    staffLoginOptions: [StaffLoginOption!]!
    """Personal con sesion: quien puede usar una cuenta compartida (cuentas activas no compartidas)."""
    actingStaffOptions: [StaffLoginOption!]!
    """Listado de personal del local (requiere rol gestion)."""
    staffUsers: [Staff!]!
    """Que datos pedir en el login a ese email (nombre, autorizacion de datos)."""
    loginRequirements(identifier: String!): LoginRequirements!
  }

  extend type Mutation {
    """Paso 1 del login: envia un codigo de un solo uso al email (identifier; solo se acepta email)."""
    requestOtp(identifier: String!): Boolean!
    """Paso 2 del login: valida el codigo y devuelve un token de sesion. acceptPrivacyPolicy es
    obligatorio (true) si loginRequirements pidio la autorizacion. subscribeNewsletter (opcional)
    solo cuenta al crear una cuenta nueva con email: autoriza recibir novedades."""
    verifyOtp(
      identifier: String!
      code: String!
      name: String
      acceptPrivacyPolicy: Boolean
      subscribeNewsletter: Boolean
    ): AuthPayload!
    """Derecho de actualizacion: el cliente corrige su nombre."""
    updateMyProfile(name: String!): Customer!
    """El cliente elige uno de los avatares ilustrados (su id, sin "preset:"), o null para quitarlo.
    Las fotos se suben por POST /uploads/avatar, que ya las guarda en la cuenta."""
    setMyAvatar(preset: String): Customer!
    """Igual que setMyAvatar, para el miembro del personal con sesion."""
    setMyStaffAvatar(preset: String): Staff!
    """Gestion: elige (o quita, con null) el avatar ilustrado de otro miembro del personal. Su foto
    se sube por POST /uploads/avatar?staffId=<id>."""
    setStaffAvatar(id: ID!, preset: String): Staff!
    """Marca o desmarca productos como favoritos (varios a la vez: los tamaños de un mismo cafe).
    Devuelve la lista completa de favoritos."""
    setFavoriteMenuItems(menuItemIds: [ID!]!, favorite: Boolean!): [ID!]!
    """Login del equipo del local (usuario/contraseña)."""
    staffLogin(email: String!, password: String!): StaffAuthPayload!
    """Login del equipo eligiendo la cuenta en staffLoginOptions: solo pide la contraseña."""
    staffLoginById(id: ID!, password: String!): StaffAuthPayload!
    """Contraseña olvidada: envia un codigo al email de la cuenta (por su id en staffLoginOptions o
    por su email). Devuelve el email enmascarado ("k***@gmail.com"), o null si no hay tal cuenta."""
    requestStaffPasswordReset(id: ID, email: String): String
    """Con el codigo de requestStaffPasswordReset, pone la contraseña nueva y abre sesion."""
    resetStaffPassword(id: ID, email: String, code: String!, newPassword: String!): StaffAuthPayload!
    """Cuenta compartida: elige quien la esta usando. Devuelve un token nuevo con esa persona (sin
    pedir su contraseña: solo cambia a nombre de quien queda lo que se hace, no los permisos)."""
    setActingStaff(staffId: ID!): StaffAuthPayload!
    """Alta de personal (requiere rol gestion)."""
    createStaffUser(name: String!, email: String!, password: String!, role: StaffRole!, shared: Boolean): Staff!
    """Edicion de personal: nombre, rol, contraseña, si la cuenta esta activa y si es compartida (requiere rol gestion)."""
    updateStaffUser(id: ID!, name: String, role: StaffRole, password: String, active: Boolean, shared: Boolean): Staff!
    """Borra una cuenta de personal sin pedidos ni otros registros a su nombre (requiere rol gestion)."""
    deleteStaffUser(id: ID!): Boolean!
  }
`;
