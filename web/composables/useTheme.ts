export type ThemePreference = "system" | "light" | "dark";

const ORDER: ThemePreference[] = ["system", "light", "dark"];
export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Según el sistema",
  light: "Claro",
  dark: "Oscuro",
};

/**
 * Tema elegido por el usuario. "Segun el sistema" (por defecto) no pone nada y manda
 * prefers-color-scheme; "Claro" y "Oscuro" ponen data-theme en <html> (ver assets/main.css).
 * Va en una cookie, no en localStorage: asi el servidor ya pinta la pagina con el tema elegido
 * y no hay un destello del otro al cargar.
 */
export function useTheme() {
  const cookie = useCookie<ThemePreference | null>("lq_theme", {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    default: () => null,
  });
  const preference = computed<ThemePreference>(() =>
    cookie.value === "light" || cookie.value === "dark" ? cookie.value : "system"
  );

  function setPreference(value: ThemePreference) {
    cookie.value = value === "system" ? null : value;
  }
  /** Siguiente en el ciclo Sistema -> Claro -> Oscuro. */
  function cycle() {
    setPreference(ORDER[(ORDER.indexOf(preference.value) + 1) % ORDER.length]!);
  }
  const next = computed(() => ORDER[(ORDER.indexOf(preference.value) + 1) % ORDER.length]!);

  return { preference, next, setPreference, cycle };
}

/** Se llama una vez, desde app.vue: refleja la preferencia en <html data-theme="...">. */
export function useThemeAttribute() {
  const { preference } = useTheme();
  useHead({
    htmlAttrs: { "data-theme": computed(() => (preference.value === "system" ? undefined : preference.value)) },
  });
}
