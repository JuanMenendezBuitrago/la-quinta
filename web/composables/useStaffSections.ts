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
  // Solo gestion: muestra datos personales (la politica de privacidad limita el acceso a quien lo necesita).
  { id: "clientes", label: "Clientes", group: "local", roles: ["gestion"] },
  { id: "personal", label: "Personal", group: "local", roles: ["gestion"] },
  { id: "carta", label: "Carta", group: "web", roles: ["gestion"] },
  { id: "portada", label: "Portada", group: "web", roles: ["gestion"] },
  { id: "pie", label: "Pie de página", group: "web", roles: ["gestion"] },
] as const satisfies readonly { id: string; label: string; group: string; roles: readonly StaffRole[] }[];

export type StaffSectionId = (typeof STAFF_SECTIONS)[number]["id"];
export type StaffGroupId = (typeof STAFF_GROUPS)[number]["id"];

export function sectionsFor(role: string | undefined) {
  return STAFF_SECTIONS.filter((s) => (s.roles as readonly string[]).includes(role ?? ""));
}

/** Seccion activa segun la URL; si no existe o el rol no la ve, la cola. */
export function useStaffSection() {
  const route = useRoute();
  return computed<StaffSectionId>(() => {
    const role = useState<{ role: string } | null>("lq-staff").value?.role;
    const requested = route.query.s;
    const match = sectionsFor(role).find((s) => s.id === requested);
    return match?.id ?? "cola";
  });
}

export function goToSection(id: StaffSectionId) {
  return navigateTo({ path: "/staff", query: id === "cola" ? {} : { s: id } });
}

/** Contadores que la pagina del panel publica para el menu (pedidos en cola, insumos bajo minimo). */
export function useStaffBadges() {
  return useState<Partial<Record<StaffSectionId, number>>>("lq-staff-badges", () => ({}));
}
