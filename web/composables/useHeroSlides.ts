import { gql } from "graphql-tag";

export type HeroTone = "teal" | "brown" | "olive";

export interface HeroSlide {
  id: string;
  tag: string;
  title: string;
  text: string | null;
  tone: HeroTone;
  linkUrl: string | null;
  linkLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  position: number;
}

const SLIDE_FIELDS = `id tag title text tone linkUrl linkLabel startDate endDate active position`;

/** Publica: las que se ven hoy en la portada. */
export const HERO_SLIDES_QUERY = gql`
  query HeroSlides {
    heroSlides { ${SLIDE_FIELDS} }
  }
`;

/** Gestion: todas, tambien ocultas, programadas y caducadas. */
export const ALL_HERO_SLIDES_QUERY = gql`
  query AllHeroSlides {
    allHeroSlides { ${SLIDE_FIELDS} }
  }
`;

export const CREATE_HERO_SLIDE = gql`
  mutation CreateHeroSlide($input: HeroSlideInput!) {
    createHeroSlide(input: $input) { ${SLIDE_FIELDS} }
  }
`;

export const UPDATE_HERO_SLIDE = gql`
  mutation UpdateHeroSlide($id: ID!, $input: HeroSlideInput!) {
    updateHeroSlide(id: $id, input: $input) { ${SLIDE_FIELDS} }
  }
`;

export const DELETE_HERO_SLIDE = gql`
  mutation DeleteHeroSlide($id: ID!) {
    deleteHeroSlide(id: $id)
  }
`;

export const MOVE_HERO_SLIDE = gql`
  mutation MoveHeroSlide($id: ID!, $direction: MoveDirection!) {
    moveHeroSlide(id: $id, direction: $direction) { ${SLIDE_FIELDS} }
  }
`;

export const HERO_TONES: { value: HeroTone; label: string }[] = [
  { value: "teal", label: "Turquesa" },
  { value: "brown", label: "Marrón" },
  { value: "olive", label: "Oliva" },
];
