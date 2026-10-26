import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { User } from "../users/model";
import { LoyaltyTransaction, LOYALTY_RULES } from "./model";
import { stampsBalance } from "./redemption";

async function loadStatus(customerId: string) {
  const history = await LoyaltyTransaction.find({ customerId }).sort({ createdAt: -1 });
  const balance = history.reduce((sum, tx) => sum + tx.stamps, 0);
  return {
    balance,
    rewardThreshold: LOYALTY_RULES.rewardThresholdStamps,
    rewardAvailable: balance >= LOYALTY_RULES.rewardThresholdStamps,
    history,
  };
}

export const loyaltyResolvers = {
  Query: {
    myLoyaltyStatus: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      return loadStatus(customerId);
    },
  },
  // Customer llega como documento de User (_id); CustomerMatch, ya con id en texto.
  Customer: {
    rewardAvailable: async (c: any) => (await stampsBalance(String(c._id))) >= LOYALTY_RULES.rewardThresholdStamps,
    stampsBalance: (c: any) => stampsBalance(String(c._id)),
  },
  CustomerMatch: {
    rewardAvailable: async (c: any) => (await stampsBalance(c.id)) >= LOYALTY_RULES.rewardThresholdStamps,
  },
  LoyaltyTransaction: {
    id: (doc: any) => doc._id.toString(),
    createdAt: (doc: any) => doc.createdAt.toISOString(),
  },
  Mutation: {
    adjustCustomerStamps: async (
      _: unknown,
      args: { customerId: string; stamps: number; note: string },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      const note = args.note.trim();
      if (!Number.isInteger(args.stamps) || args.stamps === 0) throw new Error("Indica cuantos sellos sumar o restar");
      if (Math.abs(args.stamps) > 100) throw new Error("Un ajuste no puede pasar de 100 sellos");
      if (!note) throw new Error("Indica el motivo del ajuste");
      await requireActiveCustomer(args.customerId);

      const status = await loadStatus(args.customerId);
      if (status.balance + args.stamps < 0) {
        throw new Error(`El cliente tiene ${status.balance} sellos: no se le pueden restar ${-args.stamps}`);
      }
      await LoyaltyTransaction.create({
        customerId: args.customerId,
        stamps: args.stamps,
        reason: "ajuste",
        staffId: staff.id,
        note,
      });
      return loadStatus(args.customerId);
    },
  },
};

async function requireActiveCustomer(customerId: string) {
  const exists = await User.exists({ _id: customerId, deletedAt: { $exists: false } });
  if (!exists) throw new Error("Cliente no encontrado");
}
