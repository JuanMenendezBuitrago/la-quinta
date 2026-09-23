import { gql } from "graphql-tag";

// Compartida entre el pie de pagina (lectura) y el panel de personal (lectura + edicion),
// asi el shape de datos no se puede desincronizar entre ambos.
export const SITE_SETTINGS_QUERY = gql`
  query SiteSettings {
    siteSettings {
      address
      addressMapUrl
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
    }
  }
`;

export const UPDATE_SITE_SETTINGS = gql`
  mutation UpdateSiteSettings($input: SiteSettingsInput!) {
    updateSiteSettings(input: $input) {
      address
      addressMapUrl
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
    }
  }
`;

export interface ScheduleLine {
  label: string;
  hours: string;
}

export interface SiteSettings {
  address: string | null;
  addressMapUrl: string | null;
  schedule: ScheduleLine[];
  phone: string | null;
  email: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialTiktok: string | null;
  socialWhatsapp: string | null;
}
