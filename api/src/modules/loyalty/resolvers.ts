import { GraphQLContext, requireCustomer } from "../../graphql/context";
import { LoyaltyTransaction, LOYALTY_RULES } from "./model";

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
  LoyaltyTransaction: {
    id: (doc: any) => doc._id.toString(),
    createdAt: (doc: any) => doc.createdAt.toISOString(),
  },
  Mutation: {
    redeemLoyaltyReward: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const status = await loadStatus(customerId);

      if (!status.rewardAvailable) {
        throw new Error("Todavia no tienes sellos suficientes para canjear");
      }

      await LoyaltyTransaction.create({
        customerId,
        stamps: -LOYALTY_RULES.rewardThresholdStamps,
        reason: "canje",
      });

      return loadStatus(customerId);
    },
  },
};
