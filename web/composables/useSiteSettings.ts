import { gql } from "graphql-tag";

// Compartida entre el pie de pagina (lectura) y el panel de personal (lectura + edicion),
// asi el shape de datos no se puede desincronizar entre ambos.
export const SITE_SETTINGS_QUERY = gql`
  query SiteSettings {
    siteSettings {
      address
      addressMapUrl
      openingHours {
        weekday
        open
        close
      }
      schedule {
        label
        hours
      }
      phone
      email
      socialInstagram
      socialFacebook
      socialTiktok
      socialWhatsapp
      legalName
      taxId
      privacyEmail
      staffOnlyOrders
      orderQueueEnabled
      showInactiveStaff
      packagingFeeCents
      ticketPrintingEnabled
      rewardThresholdStamps
    }
  }
`;

export const UPDATE_SITE_SETTINGS = gql`
  mutation UpdateSiteSettings($input: SiteSettingsInput!) {
    updateSiteSettings(input: $input) {
      address
      addressMapUrl
      openingHours {
        weekday
        open
        close
      }
      schedule {
        label
        hours
      }
      phone
      email
      socialInstagram
      socialFacebook
      socialTiktok
      socialWhatsapp
      legalName
      taxId
      privacyEmail
      staffOnlyOrders
      orderQueueEnabled
      showInactiveStaff
      packagingFeeCents
      ticketPrintingEnabled
      rewardThresholdStamps
    }
  }
`;

export interface ScheduleLine {
  label: string;
  hours: string;
}

/** Horario de un dia, en hora de la tienda. weekday: 1 = lunes ... 7 = domingo. */
export interface OpeningHours {
  weekday: number;
  open: string;
  close: string;
}

export interface SiteSettings {
  address: string | null;
  addressMapUrl: string | null;
  /** Dias abiertos; el que no aparece, la tienda esta cerrada. */
  openingHours: OpeningHours[];
  /** Lineas para mostrar, generadas por la API a partir de openingHours. */
  schedule: ScheduleLine[];
  phone: string | null;
  email: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialTiktok: string | null;
  socialWhatsapp: string | null;
  legalName: string | null;
  taxId: string | null;
  privacyEmail: string | null;
  /** Solo el personal crea pedidos: el cliente ve la carta y sus pedidos, pero no puede pedir. */
  staffOnlyOrders: boolean;
  /** Cola de pedidos. Desactivada: solo "Guardar y pagar" y sin pedidos desde la web. */
  orderQueueEnabled: boolean;
  /** Listado de "Personal": si muestra tambien las cuentas desactivadas. */
  showInactiveStaff: boolean;
  /** Recargo por empaque de cada pedido para llevar (pesos). 0 = sin recargo. */
  packagingFeeCents: number;
  /** Boton "Imprimir ticket" del panel (impresora termica por RawBT en la tablet Android). */
  ticketPrintingEnabled: boolean;
  /** Sellos que hacen falta para canjear la recompensa. */
  rewardThresholdStamps: number;
}

/**
 * Si el cliente puede anadir productos y hacer pedidos desde la web. Mismo query que el pie de
 * pagina: sale de la cache de Apollo (y en SSR ya viene resuelto, sin parpadeo de botones).
 * Mientras no se sabe, se ocultan los controles: mejor no ofrecer algo que la API rechazaria.
 */
export function useCustomerOrdering() {
  const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
  // Sin cola, nadie veria el pedido para prepararlo: la API tambien lo rechaza.
  return computed(
    () => result.value?.siteSettings.staffOnlyOrders === false && result.value.siteSettings.orderQueueEnabled !== false
  );
}

/**
 * Si la cola de pedidos esta activa (la seccion "Cola" y el boton "Hacer pedido"). Mientras no se
 * sabe, se da por activa: es lo normal y asi no parpadea el menu.
 */
export function useOrderQueueEnabled() {
  const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
  return computed(() => result.value?.siteSettings.orderQueueEnabled !== false);
}

/**
 * Recargo por empaque vigente, para mostrarlo antes de pedir (el que cuenta lo pone la API al
 * crear el pedido). Misma consulta, desde la cache de Apollo.
 */
export function usePackagingFee() {
  const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
  return computed(() => result.value?.siteSettings.packagingFeeCents ?? 0);
}
