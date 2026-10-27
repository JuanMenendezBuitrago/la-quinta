import { gql } from "graphql-tag";

const REQUEST_OTP = gql`
  mutation RequestOtp($identifier: String!) {
    requestOtp(identifier: $identifier)
  }
`;

const VERIFY_OTP = gql`
  mutation VerifyOtp(
    $identifier: String!
    $code: String!
    $name: String
    $acceptPrivacyPolicy: Boolean
    $subscribeNewsletter: Boolean
  ) {
    verifyOtp(
      identifier: $identifier
      code: $code
      name: $name
      acceptPrivacyPolicy: $acceptPrivacyPolicy
      subscribeNewsletter: $subscribeNewsletter
    ) {
      token
      customer {
        id
        name
        email
        phone
        customerCode
        avatar
      }
    }
  }
`;

const LOGIN_REQUIREMENTS = gql`
  query LoginRequirements($identifier: String!) {
    loginRequirements(identifier: $identifier) {
      askName
      askPrivacyConsent
    }
  }
`;

export interface LoginRequirements {
  askName: boolean;
  askPrivacyConsent: boolean;
}

const STAFF_LOGIN = gql`
  mutation StaffLogin($email: String!, $password: String!) {
    staffLogin(email: $email, password: $password) {
      token
      staff {
        id
        name
        email
        role
        avatar
        shared
      }
    }
  }
`;

const STAFF_LOGIN_BY_ID = gql`
  mutation StaffLoginById($id: ID!, $password: String!) {
    staffLoginById(id: $id, password: $password) {
      token
      staff {
        id
        name
        email
        role
        avatar
        shared
      }
    }
  }
`;

// Contraseña olvidada: codigo al email de la cuenta (por su id en la lista o por su email).
const REQUEST_STAFF_PASSWORD_RESET = gql`
  mutation RequestStaffPasswordReset($id: ID, $email: String) {
    requestStaffPasswordReset(id: $id, email: $email)
  }
`;

const RESET_STAFF_PASSWORD = gql`
  mutation ResetStaffPassword($id: ID, $email: String, $code: String!, $newPassword: String!) {
    resetStaffPassword(id: $id, email: $email, code: $code, newPassword: $newPassword) {
      token
      staff {
        id
        name
        email
        role
        avatar
        shared
      }
    }
  }
`;

const SESSION_QUERY = gql`
  query Session {
    me {
      id
      name
      customerCode
      avatar
    }
    myStaffProfile {
      id
      name
      role
      avatar
      shared
      actingAs {
        id
        name
        avatar
      }
    }
  }
`;

/**
 * El token vive en una cookie y sobrevive a recargas, pero customer/staff son estado en memoria:
 * al recargar (o al abrir la app de nuevo) hay que reconstruirlos preguntando a la API quien
 * es el dueño del token. Se llama una vez desde app.vue.
 */
export async function restoreSession() {
  const customer = useState<any>("lq-customer", () => null);
  const staff = useState<any>("lq-staff", () => null);
  if (customer.value || staff.value) return;
  if (!useCookie("lq_auth_token").value) return;

  const { defaultClient } = useNuxtApp().$apollo;
  try {
    const { data } = await defaultClient.query({ query: SESSION_QUERY, fetchPolicy: "network-only" });
    customer.value = data?.me ?? null;
    staff.value = data?.myStaffProfile ?? null;
  } catch {
    // token caducado o API no disponible: se queda sin sesion y se pedira login
  }
}

/**
 * Sesion de cliente (login sin contraseña, por codigo de un solo uso).
 * El token se guarda en la cookie que @nuxtjs/apollo adjunta automaticamente
 * como Authorization en cada peticion (ver apollo.clients.default en nuxt.config.ts).
 */
export function useAuth() {
  const { onLogin, onLogout } = useApollo();
  const customer = useState<{ id: string; name: string; customerCode: string; avatar?: string | null } | null>(
    "lq-customer",
    () => null
  );
  const { mutate: requestOtp } = useMutation(REQUEST_OTP);
  const { mutate: verifyOtp } = useMutation(VERIFY_OTP);

  /** Envia el codigo y devuelve que hay que pedir en el paso siguiente: el nombre (solo a
   * clientes nuevos) y la autorizacion de datos (nuevos o sin la version vigente de la politica). */
  async function requestCode(identifier: string): Promise<LoginRequirements> {
    const { defaultClient } = useNuxtApp().$apollo;
    const [, requirementsResult] = await Promise.all([
      requestOtp({ identifier }),
      defaultClient.query({ query: LOGIN_REQUIREMENTS, variables: { identifier }, fetchPolicy: "network-only" }),
    ]);
    return requirementsResult?.data?.loginRequirements ?? { askName: true, askPrivacyConsent: true };
  }

  async function verifyCode(
    identifier: string,
    code: string,
    name?: string,
    acceptPrivacyPolicy?: boolean,
    subscribeNewsletter?: boolean
  ) {
    const result = await verifyOtp({ identifier, code, name, acceptPrivacyPolicy, subscribeNewsletter });
    const payload = result?.data?.verifyOtp;
    if (!payload) throw new Error("No se pudo verificar el codigo");
    await onLogin(payload.token);
    customer.value = payload.customer;
    return payload.customer;
  }

  async function logout() {
    await onLogout();
    customer.value = null;
  }

  return { customer, requestCode, verifyCode, logout };
}

/** Quien puede usar una cuenta compartida (selector de la cabecera y pantalla "¿Quién eres?"). */
export const ACTING_STAFF_OPTIONS = gql`
  query ActingStaffOptions {
    actingStaffOptions {
      id
      name
      avatar
    }
  }
`;

const SET_ACTING_STAFF = gql`
  mutation SetActingStaff($staffId: ID!) {
    setActingStaff(staffId: $staffId) {
      token
    }
  }
`;

export interface StaffPerson {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface StaffSession extends StaffPerson {
  role: string;
  /** Cuenta compartida: hay que elegir quien la usa (actingAs). */
  shared?: boolean;
  /** Quien esta usando la cuenta compartida: lo que se hace queda a su nombre. */
  actingAs?: StaffPerson | null;
}

/** Sesion del personal del local (usuario/contraseña). Comparte el mismo
 * token/cookie que la sesion de cliente: el rol lo decide el backend segun
 * el contenido del JWT, no el frontend. */
export function useStaffAuth() {
  const { onLogin, onLogout } = useApollo();
  const staff = useState<StaffSession | null>("lq-staff", () => null);
  const { mutate: staffLogin } = useMutation(STAFF_LOGIN);
  const { mutate: staffLoginById } = useMutation(STAFF_LOGIN_BY_ID);
  const { mutate: setActing } = useMutation(SET_ACTING_STAFF);
  const { mutate: requestReset } = useMutation(REQUEST_STAFF_PASSWORD_RESET);
  const { mutate: resetPassword } = useMutation(RESET_STAFF_PASSWORD);

  async function startSession(payload: { token: string; staff: any } | undefined) {
    if (!payload) throw new Error("Credenciales invalidas");
    await onLogin(payload.token);
    staff.value = payload.staff;
    return payload.staff;
  }

  async function login(email: string, password: string) {
    const result = await staffLogin({ email, password });
    return startSession(result?.data?.staffLogin);
  }

  /** Cuenta elegida en la lista de la pantalla de acceso: solo hace falta la contraseña. */
  async function loginById(id: string, password: string) {
    const result = await staffLoginById({ id, password });
    return startSession(result?.data?.staffLoginById);
  }

  /**
   * Contraseña olvidada: envia el codigo. Devuelve el email (enmascarado) al que llega, o null si
   * la cuenta no tiene donde recibirlo.
   */
  async function requestPasswordReset(target: { id?: string; email?: string }) {
    const result = await requestReset(target);
    return (result?.data?.requestStaffPasswordReset as string | null | undefined) ?? null;
  }

  /** Con el codigo: contraseña nueva y, de paso, sesion abierta. */
  async function resetPasswordWithCode(target: { id?: string; email?: string }, code: string, newPassword: string) {
    const result = await resetPassword({ ...target, code, newPassword });
    return startSession(result?.data?.resetStaffPassword);
  }

  /** Cuenta compartida: elige quien la usa. El token nuevo lleva a esa persona (ver la API). */
  async function setActingStaff(person: StaffPerson) {
    const result = await setActing({ staffId: person.id });
    const token = result?.data?.setActingStaff.token;
    if (!token) throw new Error("No se pudo cambiar de persona");
    // Sin vaciar la cache de Apollo: los datos no cambian (solo a nombre de quien queda lo
    // siguiente), asi el cambio es instantaneo y no se recarga la pantalla.
    await onLogin(token, undefined, true);
    if (staff.value) staff.value = { ...staff.value, actingAs: person };
  }

  async function logout() {
    await onLogout();
    staff.value = null;
  }

  return { staff, login, loginById, logout, setActingStaff, requestPasswordReset, resetPasswordWithCode };
}
