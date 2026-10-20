import { Types } from "mongoose";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { Order } from "../orders/model";
import { User } from "../users/model";
import { REVIEW_COMMENT_MAX, Review, ReviewDoc } from "./model";

const MAX_PAGE_SIZE = 100;
type ReviewKind = "ALL" | "ORDER" | "GENERAL";

function kindFilter(kind?: ReviewKind | null): Record<string, unknown> {
  if (kind === "ORDER") return { orderId: { $ne: null } };
  if (kind === "GENERAL") return { orderId: null };
  return {};
}

/** Codigos de pedido de varias opiniones a la vez (una sola consulta). */
async function orderCodes(reviews: Pick<ReviewDoc, "orderId">[]) {
  const ids = reviews.map((r) => r.orderId).filter((id): id is Types.ObjectId => !!id);
  const orders = ids.length ? await Order.find({ _id: { $in: ids } }).select("code").lean() : [];
  return new Map(orders.map((o) => [o._id.toString(), o.code]));
}

function base(r: ReviewDoc, codes: Map<string, string>) {
  return {
    id: r._id.toString(),
    orderId: r.orderId?.toString() ?? null,
    orderCode: r.orderId ? codes.get(r.orderId.toString()) ?? null : null,
    rating: r.rating,
    comment: r.comment || null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const reviewsResolvers = {
  Query: {
    myReviews: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const reviews = await Review.find({ customerId }).sort({ updatedAt: -1 }).lean<ReviewDoc[]>();
      const codes = await orderCodes(reviews);
      return reviews.map((r) => base(r, codes));
    },
    reviews: async (
      _: unknown,
      args: { kind?: ReviewKind; rating?: number; limit?: number; offset?: number },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const filter = kindFilter(args.kind);
      if (args.rating) filter.rating = args.rating;
      const limit = Math.min(Math.max(args.limit ?? 25, 1), MAX_PAGE_SIZE);
      const offset = Math.max(args.offset ?? 0, 0);
      const [total, reviews] = await Promise.all([
        Review.countDocuments(filter),
        Review.find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean<ReviewDoc[]>(),
      ]);
      const [codes, users] = await Promise.all([
        orderCodes(reviews),
        User.find({ _id: { $in: reviews.map((r) => r.customerId) } }).select("name avatar").lean(),
      ]);
      const userById = new Map(users.map((u) => [u._id.toString(), u]));
      return {
        total,
        items: reviews.map((r) => {
          const user = userById.get(r.customerId.toString());
          return { ...base(r, codes), customerName: user?.name ?? "Cliente", customerAvatar: user?.avatar ?? null };
        }),
      };
    },
    reviewStats: async (_: unknown, args: { kind?: ReviewKind }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      const groups = await Review.aggregate<{ _id: number; n: number }>([
        { $match: kindFilter(args.kind) },
        { $group: { _id: "$rating", n: { $sum: 1 } } },
      ]);
      const distribution = [1, 2, 3, 4, 5].map((stars) => groups.find((g) => g._id === stars)?.n ?? 0);
      const count = distribution.reduce((a, b) => a + b, 0);
      const average = count ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / count : 0;
      return { count, average: Math.round(average * 100) / 100, distribution };
    },
  },
  Mutation: {
    submitReview: async (
      _: unknown,
      args: { orderId?: string | null; rating: number; comment?: string | null },
      ctx: GraphQLContext
    ) => {
      const customerId = requireCustomer(ctx);
      if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
        throw new Error("La puntuación va de 1 a 5 estrellas");
      }
      const comment = args.comment?.trim() ?? "";
      if (comment.length > REVIEW_COMMENT_MAX) throw new Error(`El comentario admite hasta ${REVIEW_COMMENT_MAX} caracteres`);

      let orderId: Types.ObjectId | null = null;
      if (args.orderId) {
        if (!Types.ObjectId.isValid(args.orderId)) throw new Error("Pedido no encontrado");
        // Solo sus propios pedidos y ya entregados: no se opina de lo que aun no ha recibido.
        const order = await Order.findOne({ _id: args.orderId, customerId }).select("status").lean();
        if (!order) throw new Error("Pedido no encontrado");
        if (order.status !== "ENTREGADO") throw new Error("Solo puedes valorar pedidos ya entregados");
        orderId = order._id;
      }

      const now = new Date();
      const review = await Review.findOneAndUpdate(
        { customerId, orderId },
        {
          $set: { rating: args.rating, updatedAt: now, ...(comment ? { comment } : {}) },
          ...(comment ? {} : { $unset: { comment: 1 } }),
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true }
      ).lean<ReviewDoc>();
      return base(review!, await orderCodes([review!]));
    },
  },
};
