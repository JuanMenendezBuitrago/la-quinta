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
    }
    myStaffProfile {
      id
      name
      role
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
  const customer = useState<{ id: string; name: string; customerCode: string } | null>(
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

/** Sesion del personal del local (usuario/contraseña). Comparte el mismo
 * token/cookie que la sesion de cliente: el rol lo decide el backend segun
 * el contenido del JWT, no el frontend. */
export function useStaffAuth() {
  const { onLogin, onLogout } = useApollo();
  const staff = useState<{ id: string; name: string; role: string } | null>("lq-staff", () => null);
  const { mutate: staffLogin } = useMutation(STAFF_LOGIN);

  async function login(email: string, password: string) {
    const result = await staffLogin({ email, password });
    const payload = result?.data?.staffLogin;
    if (!payload) throw new Error("Credenciales invalidas");
    await onLogin(payload.token);
    staff.value = payload.staff;
    return payload.staff;
  }

  async function logout() {
    await onLogout();
    staff.value = null;
  }

  return { staff, login, logout };
}
