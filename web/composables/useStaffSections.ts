import { useOrderQueueEnabled } from "~/composables/useSiteSettings";

type StaffRole = "barra" | "gestion";

// Secciones del panel de personal y como se agrupan en el menu superior. La seccion activa va
// en la URL (/staff?s=inventario): el menu vive en app.vue y la pagina solo la lee.
export const STAFF_GROUPS = [
  { id: "pedidos", label: "Pedidos" },
  { id: "local", label: "Local" },
  { id: "web", label: "Web" },
] as const;

export const STAFF_SECTIONS = [
  { id: "cola", label: "Cola", group: "pedidos", roles: ["barra", "gestion"] },
  { id: "tomar", label: "Tomar pedido", group: "pedidos", roles: ["barra", "gestion"] },
  { id: "historial", label: "Historial", group: "pedidos", roles: ["barra", "gestion"] },
  { id: "inventario", label: "Inventario", group: "local", roles: ["barra", "gestion"] },
  { id: "caja", label: "Cierre de caja", group: "local", roles: ["barra", "gestion"] },
  // Solo gestion: muestra datos personales (la politica de privacidad limita el acceso a quien lo necesita).
  { id: "clientes", label: "Clientes", group: "local", roles: ["barra", "gestion"] },
  { id: "personal", label: "Personal", group: "local", roles: ["gestion"] },
  // Opiniones de los clientes (con su nombre: datos personales, solo gestion).
  { id: "opiniones", label: "Opiniones", group: "local", roles: ["gestion"] },
  { id: "carta", label: "Carta", group: "web", roles: ["gestion"] },
  // Fotos de clientes de lo que pidieron: se moderan antes de salir en la carta.
  { id: "fotos", label: "Fotos de clientes", group: "web", roles: ["gestion"] },
  { id: "cafe", label: "Café en grano", group: "web", roles: ["gestion"] },
  { id: "portada", label: "Portada", group: "web", roles: ["gestion"] },
  // Correos de novedades a los clientes que lo han autorizado (datos personales: solo gestion).
  { id: "novedades", label: "Novedades", group: "web", roles: ["gestion"] },
  // id "pie": nombre historico (enlaces /staff?s=pie); ahora incluye tambien los pedidos de clientes.
  { id: "pie", label: "Configuración", group: "web", roles: ["gestion"] },
] as const satisfies readonly { id: string; label: string; group: string; roles: readonly StaffRole[] }[];

export type StaffSectionId = (typeof STAFF_SECTIONS)[number]["id"];
export type StaffGroupId = (typeof STAFF_GROUPS)[number]["id"];

export function sectionsFor(role: string | undefined) {
  return STAFF_SECTIONS.filter((s) => (s.roles as readonly string[]).includes(role ?? ""));
}

/** Secciones que ve el personal con sesion: las de su rol, sin "Cola" si esta desactivada. */
export function useVisibleSections() {
  const queueEnabled = useOrderQueueEnabled();
  return computed(() => {
    const role = useState<{ role: string } | null>("lq-staff").value?.role;
    return sectionsFor(role).filter((s) => queueEnabled.value || s.id !== "cola");
  });
}

/** Seccion activa segun la URL; si no existe o no se ve, la cola (o, sin cola, tomar pedido). */
export function useStaffSection() {
  const route = useRoute();
  const visible = useVisibleSections();
  return computed<StaffSectionId>(() => {
    const requested = route.query.s;
    const match = visible.value.find((s) => s.id === requested);
    if (match) return match.id;
    return visible.value.some((s) => s.id === "cola") ? "cola" : "tomar";
  });
}

export function goToSection(id: StaffSectionId) {
  return navigateTo({ path: "/staff", query: id === "cola" ? {} : { s: id } });
}

/**
 * Contadores que la pagina del panel publica para los menus (pedidos en cola, insumos bajo minimo).
 */
export function useStaffBadges() {
  return useState<Partial<Record<StaffSectionId, number>>>("lq-staff-badges", () => ({}));
}

/** Fotos de clientes pendientes de moderar: la pide la pagina del panel y la actualiza la moderacion. */
export function usePendingPhotosCount() {
  return useState<number>("lq-pending-photos", () => 0);
}

/**
 * Los contadores para pintarlos en los menus: vacios hasta montar. La cabecera y la barra inferior
 * se pintan antes que la pagina, que los calcula con datos que en el SSR aun no han llegado; si se
 * pintaran ya al hidratar, el navegador los mostraria y el servidor no (aviso de hidratacion).
 */
export function useShownStaffBadges() {
  const badges = useStaffBadges();
  const mounted = ref(false);
  onMounted(() => (mounted.value = true));
  return computed<Partial<Record<StaffSectionId, number>>>(() => (mounted.value ? badges.value : {}));
}
