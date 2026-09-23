import { GraphQLContext, requireStaff } from "../../graphql/context";
import { SiteSettings } from "./model";

export const settingsResolvers = {
  Query: {
    // upsert sin filtro: si nadie ha guardado nunca la configuracion, crea el documento con
    // los valores por defecto del modelo (los mismos que llevaba el footer a mano) en vez de
    // devolver null y obligar al frontend a manejar ese caso.
    siteSettings: async () => {
      return SiteSettings.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
    },
  },
  Mutation: {
    updateSiteSettings: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
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
