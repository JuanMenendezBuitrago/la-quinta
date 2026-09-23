import { Types } from "mongoose";
import { GraphQLContext, requireStaff } from "../../graphql/context";
import { User, StaffUser, UserDoc } from "../users/model";
import { Order } from "../orders/model";
import { LoyaltyTransaction, LOYALTY_RULES } from "../loyalty/model";

const MAX_PAGE_SIZE = 100;

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pedidos y sellos agregados de varios clientes a la vez (una consulta por coleccion). */
async function statsFor(customerIds: Types.ObjectId[]) {
  const [orderStats, stampStats] = await Promise.all([
    Order.aggregate<{
      _id: Types.ObjectId;
      ordersCount: number;
      deliveredCount: number;
      cancelledCount: number;
      spentCents: number;
      lastOrderAt: Date;
    }>([
      { $match: { customerId: { $in: customerIds } } },
      {
        $group: {
          _id: "$customerId",
          ordersCount: { $sum: 1 },
          deliveredCount: { $sum: { $cond: [{ $eq: ["$status", "ENTREGADO"] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "CANCELADO"] }, 1, 0] } },
          spentCents: { $sum: { $cond: [{ $eq: ["$status", "ENTREGADO"] }, "$totalCents", 0] } },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
    ]),
    LoyaltyTransaction.aggregate<{ _id: Types.ObjectId; balance: number }>([
      { $match: { customerId: { $in: customerIds } } },
      { $group: { _id: "$customerId", balance: { $sum: "$stamps" } } },
    ]),
  ]);
  return {
    orders: new Map(orderStats.map((s) => [s._id.toString(), s])),
    stamps: new Map(stampStats.map((s) => [s._id.toString(), s.balance])),
  };
}

function summary(user: UserDoc, stats: Awaited<ReturnType<typeof statsFor>>) {
  const id = user._id.toString();
  const o = stats.orders.get(id);
  const balance = stats.stamps.get(id) ?? 0;
  return {
    id,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    customerCode: user.customerCode,
    createdAt: user.createdAt.toISOString(),
    ordersCount: o?.ordersCount ?? 0,
    deliveredCount: o?.deliveredCount ?? 0,
    cancelledCount: o?.cancelledCount ?? 0,
    spentCents: o?.spentCents ?? 0,
    lastOrderAt: o?.lastOrderAt?.toISOString() ?? null,
    stampsBalance: balance,
    rewardAvailable: balance >= LOYALTY_RULES.rewardThresholdStamps,
  };
}

/**
 * Vista de clientes para Gestion. Solo lectura: como "privacy", reune datos de varios modulos
 * (usuarios, pedidos, fidelizacion); las acciones sobre sellos viven en "loyalty".
 */
export const customersResolvers = {
  Query: {
    customers: async (
      _: unknown,
      args: { search?: string; limit?: number; offset?: number },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
      const search = args.search?.trim();
      if (search) {
        const re = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: re }, { email: re }, { phone: re }, { customerCode: re }];
      }
      const limit = Math.min(Math.max(args.limit ?? 25, 1), MAX_PAGE_SIZE);
      const offset = Math.max(args.offset ?? 0, 0);

      const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean<UserDoc[]>(),
      ]);
      const stats = await statsFor(users.map((u) => u._id));
      return { total, items: users.map((u) => summary(u, stats)) };
    },

    customerDetail: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Cliente no encontrado");
      const user = await User.findOne({ _id: args.id, deletedAt: { $exists: false } }).lean<UserDoc>();
      if (!user) throw new Error("Cliente no encontrado");

      const [stats, orders, movements] = await Promise.all([
        statsFor([user._id]),
        Order.find({ customerId: user._id }).sort({ createdAt: -1 }).exec(),
        LoyaltyTransaction.find({ customerId: user._id }).sort({ createdAt: -1 }).lean(),
      ]);
      const orderCodes = new Map(orders.map((o) => [o._id.toString(), o.code]));
      const staffIds = [...new Set(movements.flatMap((m) => (m.staffId ? [m.staffId.toString()] : [])))];
      const staffNames = new Map(
        (await StaffUser.find({ _id: { $in: staffIds } }).select("name").lean()).map((s) => [s._id.toString(), s.name])
      );

      return {
        customer: summary(user, stats),
        rewardThreshold: LOYALTY_RULES.rewardThresholdStamps,
        orders,
        stamps: movements.map((m) => ({
          id: m._id.toString(),
          stamps: m.stamps,
          reason: m.reason,
          note: m.note ?? null,
          orderCode: m.orderId ? orderCodes.get(m.orderId.toString()) ?? null : null,
          staffName: m.staffId ? staffNames.get(m.staffId.toString()) ?? null : null,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  },
};
