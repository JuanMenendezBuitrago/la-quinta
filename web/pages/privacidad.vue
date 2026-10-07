<template>
  <main class="container page-privacy">
    <header class="account-hero">
      <p class="eyebrow">Protección de datos</p>
      <h1>Política de tratamiento de datos personales</h1>
      <p class="muted">Vigente desde el {{ POLICY_DATE_LABEL }}. Ley 1581 de 2012 y Decreto 1377 de 2013.</p>
    </header>

    <p v-if="settings && missingControllerData" class="card pending-notice" role="alert">
      Faltan los datos del responsable (razón social y NIT). El personal de gestión debe
      completarlos en el panel de personal, en «Pie de página».
    </p>

    <section>
      <h2>1. Responsable del tratamiento</h2>
      <ul class="plain">
        <li><strong>Responsable:</strong> {{ settings?.legalName || "La Quinta · Café de Especialidad" }}</li>
        <li v-if="settings?.taxId"><strong>NIT / C.C.:</strong> {{ settings.taxId }}</li>
        <li v-if="settings?.address"><strong>Dirección:</strong> {{ settings.address }}</li>
        <li v-if="contactEmail"><strong>Email para temas de datos:</strong> <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a></li>
        <li v-if="settings?.phone"><strong>Teléfono:</strong> {{ settings.phone }}</li>
      </ul>
    </section>

    <section>
      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>Tu nombre y el email o teléfono con el que inicias sesión.</li>
        <li>Tu código de cliente.</li>
        <li>Tus pedidos: productos, importes, fechas, hora de recogida y estado.</li>
        <li>Tus sellos de fidelización y los canjes.</li>
      </ul>
      <p>No pedimos datos sensibles ni datos de pago: los pedidos se pagan en el local.</p>
    </section>

    <section>
      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear y mantener tu cuenta, y enviarte el código para iniciar sesión.</li>
        <li>Recibir, preparar y entregarte tus pedidos, y avisarte de su estado.</li>
        <li>Gestionar tu tarjeta de sellos y tus recompensas.</li>
        <li>Llevar la contabilidad del local y cumplir nuestras obligaciones legales.</li>
        <li>Atender tus consultas y reclamos sobre tus datos.</li>
        <li>
          Solo si lo autorizas aparte (es opcional), enviarte por email novedades del local: ofertas,
          eventos y nuevos productos. Puedes retirar esta autorización cuando quieras en «Mi cuenta»
          o con el enlace que va en cada correo, sin que afecte a tu cuenta.
        </li>
      </ul>
      <p>
        Sin esa autorización aparte no te enviamos publicidad. Nunca vendemos ni cedemos tus datos a
        terceros. Si algún día quisiéramos usarlos para algo distinto, te pediremos antes una nueva
        autorización.
      </p>
    </section>

    <section>
      <h2>4. Quién más los trata por nuestra cuenta</h2>
      <p>Para prestar el servicio nos apoyamos en proveedores que tratan los datos solo siguiendo nuestras instrucciones (encargados del tratamiento):</p>
      <ul>
        <li>El proveedor de alojamiento donde funciona esta web y su base de datos.</li>
        <li>El proveedor de correo electrónico con el que te enviamos el código de acceso y, si las pediste, las novedades.</li>
        <li>
          Google (Google Sheets), donde registramos los pedidos entregados y cancelados para la
          contabilidad. Google puede almacenar esta información fuera de Colombia.
        </li>
      </ul>
    </section>

    <section>
      <h2>5. Tus derechos</h2>
      <p>Como titular de los datos puedes, en cualquier momento y de forma gratuita:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos.</li>
        <li>Pedir prueba de la autorización que nos diste.</li>
        <li>Saber qué uso les hemos dado.</li>
        <li>
          Revocar la autorización o pedir que suprimamos tus datos, salvo los que la ley nos obliga
          a conservar.
        </li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de haber acudido a nosotros.</li>
      </ul>
    </section>

    <section>
      <h2>6. Cómo ejercerlos</h2>
      <p>
        <strong>Desde tu cuenta</strong>, en <NuxtLink to="/cuenta">Mi cuenta → Mis datos</NuxtLink>:
        puedes corregir tu nombre, descargar todos tus datos (incluida la fecha en que aceptaste esta
        política) y eliminar tu cuenta.
      </p>
      <p v-if="contactEmail">
        <strong>Por email</strong>, escribiendo a <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        desde el email de tu cuenta, o indicando tu código de cliente.
      </p>
      <ul>
        <li><strong>Consultas:</strong> respondemos en un máximo de 10 días hábiles, prorrogables 5 días hábiles más avisándote del motivo.</li>
        <li><strong>Reclamos</strong> (corrección, supresión o incumplimiento): respondemos en un máximo de 15 días hábiles, prorrogables 8 días hábiles más avisándote del motivo.</li>
      </ul>
    </section>

    <section>
      <h2>7. Cuánto tiempo los conservamos</h2>
      <p>
        Tus datos de cuenta, mientras la mantengas activa. Si eliminas tu cuenta, borramos tu nombre,
        email y teléfono, también en nuestra hoja de pedidos. Los pedidos se conservan sin datos que
        te identifiquen durante el plazo que exigen las normas contables y tributarias.
      </p>
    </section>

    <section>
      <h2>8. Seguridad</h2>
      <p>
        El acceso a tu cuenta es con un código de un solo uso, sin contraseñas. Solo el personal
        del local, con usuario y contraseña propios, accede a los pedidos, y cada persona solo a
        lo que necesita para su trabajo.
      </p>
    </section>

    <section>
      <h2>9. Vigencia y cambios</h2>
      <p>
        Esta política rige desde el {{ POLICY_DATE_LABEL }}. Si la cambiamos de forma relevante, lo
        publicaremos aquí y te pediremos de nuevo la autorización la próxima vez que inicies sesión.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { SITE_SETTINGS_QUERY, type SiteSettings } from "~/composables/useSiteSettings";

// Debe coincidir con PRIVACY_POLICY_VERSION en api/src/modules/users/model.ts: al cambiar
// la politica se actualizan las dos, y la API vuelve a pedir la autorizacion en el login.
const POLICY_VERSION = "2026-09-23";
const POLICY_DATE_LABEL = new Date(`${POLICY_VERSION}T12:00:00Z`).toLocaleDateString("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

useHead({ title: "Política de tratamiento de datos · La Quinta" });

const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const settings = computed(() => result.value?.siteSettings ?? null);
const contactEmail = computed(() => settings.value?.privacyEmail || settings.value?.email || "");
const missingControllerData = computed(() => !settings.value?.legalName || !settings.value?.taxId);
</script>

<style scoped>
.page-privacy { max-width: 720px; padding-bottom: 60px; }
.account-hero { margin-bottom: 22px; }
section { margin-top: 28px; }
h2 { font-size: 18px; margin: 0 0 10px; }
p, li { font-size: 14.5px; line-height: 1.6; }
ul { padding-left: 20px; margin: 0 0 10px; }
ul.plain { list-style: none; padding-left: 0; }
a { color: inherit; text-decoration: underline; }
.pending-notice { border-color: var(--danger); color: var(--danger); font-size: 14px; }
</style>
