import { GraphQLContext, requireStaff } from "../../graphql/context";
import { DEFAULT_PACKAGING_FEE_CENTS, SiteSettings } from "./model";
import { OpeningHoursDoc, scheduleLines, validateOpeningHours } from "./openingHours";

// upsert sin filtro: si nadie ha guardado nunca la configuracion, crea el documento con
// los valores por defecto del modelo (los mismos que llevaba el footer a mano) en vez de
// devolver null y obligar al frontend a manejar ese caso.
function loadSettings() {
  return SiteSettings.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
}

/** Horario de apertura vigente. Lo usa "orders" para validar las horas de recogida. */
export async function getOpeningHours(): Promise<OpeningHoursDoc[]> {
  return (await loadSettings()).openingHours;
}

/** Si esta activo, solo el personal puede crear pedidos. Lo usa "orders" en createOrder. */
export async function staffOnlyOrders(): Promise<boolean> {
  return !!(await loadSettings()).staffOnlyOrders;
}

/** Recargo por empaque vigente. Lo usa "orders" al crear un pedido para llevar. */
export async function packagingFeeCents(): Promise<number> {
  return (await loadSettings()).packagingFeeCents ?? DEFAULT_PACKAGING_FEE_CENTS;
}

// Tope de cordura para el recargo (como los importes del cierre de caja).
const MAX_PACKAGING_FEE_CENTS = 100_000;

export const settingsResolvers = {
  Query: {
    siteSettings: () => loadSettings(),
  },
  SiteSettings: {
    openingHours: (doc: any) => [...doc.openingHours].sort((a: OpeningHoursDoc, b: OpeningHoursDoc) => a.weekday - b.weekday),
    schedule: (doc: any) => scheduleLines(doc.openingHours),
    // Documentos guardados antes de existir el campo: sin valor equivale a desactivado.
    staffOnlyOrders: (doc: any) => !!doc.staffOnlyOrders,
    packagingFeeCents: (doc: any) => doc.packagingFeeCents ?? DEFAULT_PACKAGING_FEE_CENTS,
  },
  Mutation: {
    updateSiteSettings: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (args.input.openingHours) {
        const problem = validateOpeningHours(args.input.openingHours as OpeningHoursDoc[]);
        if (problem) throw new Error(problem);
      }
      const fee = args.input.packagingFeeCents;
      if (fee != null && (!Number.isInteger(fee) || (fee as number) < 0 || (fee as number) > MAX_PACKAGING_FEE_CENTS)) {
        throw new Error("Recargo por empaque no valido");
      }
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args.input)) {
        // null en un booleano no significa "borrar": se ignora como si no viniera.
        if ((key === "staffOnlyOrders" || key === "packagingFeeCents") && value === null) continue;
        if (value !== undefined) update[key] = value;
      }
      return SiteSettings.findOneAndUpdate({}, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
    },
  },
};
