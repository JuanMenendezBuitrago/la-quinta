/**
 * Cliente y personal comparten la cookie del token: si en otra pestaña se entra como cliente,
 * esta pestaña sigue creyendo que hay sesion de personal (estado en memoria) pero la API ya la
 * rechaza, y el panel se queda vacio sin explicacion. Cuando la API responde UNAUTHENTICATED,
 * se olvida aqui la sesion que pedia (session: "staff" | "customer"), y la pagina muestra su login.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const customer = useState<unknown>("lq-customer", () => null);
  const staff = useState<unknown>("lq-staff", () => null);

  nuxtApp.hook("apollo:error", (error) => {
    for (const err of error.graphQLErrors ?? []) {
      if (err.extensions?.code !== "UNAUTHENTICATED") continue;
      if (err.extensions.session === "staff") staff.value = null;
      if (err.extensions.session === "customer") customer.value = null;
    }
  });
});
