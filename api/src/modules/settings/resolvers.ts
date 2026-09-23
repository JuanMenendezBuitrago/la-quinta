import { GraphQLContext, requireStaff } from "../../graphql/context";
import { SiteSettings } from "./model";
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

export const settingsResolvers = {
  Query: {
    siteSettings: () => loadSettings(),
  },
  SiteSettings: {
    openingHours: (doc: any) => [...doc.openingHours].sort((a: OpeningHoursDoc, b: OpeningHoursDoc) => a.weekday - b.weekday),
    schedule: (doc: any) => scheduleLines(doc.openingHours),
  },
  Mutation: {
    updateSiteSettings: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (args.input.openingHours) {
        const problem = validateOpeningHours(args.input.openingHours as OpeningHoursDoc[]);
        if (problem) throw new Error(problem);
      }
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args.input)) {
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
