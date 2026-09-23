export const privacyTypeDefs = /* GraphQL */ `
  extend type Query {
    """Derecho de acceso (Ley 1581 de 2012): todos los datos del cliente autenticado, en JSON."""
    exportMyData: String!
  }

  extend type Mutation {
    """
    Derecho de supresion: anonimiza la cuenta del cliente autenticado (nombre, email y telefono)
    y cierra su sesion. Los pedidos se conservan sin datos personales por obligaciones contables.
    """
    deleteMyAccount: Boolean!
  }
`;
