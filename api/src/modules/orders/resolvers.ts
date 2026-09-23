import { withFilter } from "graphql-subscriptions";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { ALLOWED_FROM, Order, OrderStatus, STATUS_LABELS, generateOrderCode, isDuplicateCodeError } from "./model";
import { MenuItem } from "../menu/model";
import { User } from "../users/model";
import { EVENTS } from "../../config/pubsub";
import { internalEvents, INTERNAL_EVENTS } from "../../config/events";
import { buildClosedPayload } from "./closed";

const ACTIVE_STATUSES: OrderStatus[] = ["NUEVO", "EN_PREPARACION", "LISTO"];
const MAX_CODE_ATTEMPTS = 5;
// Margen para relojes algo desfasados y para el rato que el cliente pasa en el carrito.
const PICKUP_PAST_TOLERANCE_MS = 5 * 60 * 1000;

export const ordersResolvers = {
  Query: {
    myOrders: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      return Order.find({ customerId }).sort({ createdAt: -1 }).exec();
    },
    orderQueue: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      return Order.find({ status: { $in: ACTIVE_STATUSES } }).sort({ createdAt: 1 }).exec();
    },
    orderHistory: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      return Order.find({ status: { $in: ["ENTREGADO", "CANCELADO"] } })
        .sort({ updatedAt: -1 })
        .limit(args.limit ?? 50)
        .exec();
    },
  },
  Order: {
    id: (doc: any) => doc._id.toString(),
    customer: (doc: any) => User.findById(doc.customerId).exec(),
    // Por Redis los eventos viajan como JSON: las fechas llegan como string, no como Date.
    pickupSlot: (doc: any) => new Date(doc.pickupSlot).toISOString(),
    createdAt: (doc: any) => new Date(doc.createdAt).toISOString(),
    updatedAt: (doc: any) => new Date(doc.updatedAt).toISOString(),
  },
  OrderLine: {
    imageUrl: async (line: any) => {
      const item = await MenuItem.findById(line.menuItemId).select("imageUrl").lean();
      return item?.imageUrl ?? null;
    },
  },
  Mutation: {
    createOrder: async (
      _: unknown,
      args: { items: { menuItemId: string; quantity: number }[]; pickupSlot: string },
      ctx: GraphQLContext
    ) => {
      const customerId = requireCustomer(ctx);
      if (args.items.length === 0) throw new Error("El pedido no puede estar vacio");

      const pickupSlot = new Date(args.pickupSlot);
      if (Number.isNaN(pickupSlot.getTime())) throw new Error("La hora de recogida no es valida");
      if (pickupSlot.getTime() < Date.now() - PICKUP_PAST_TOLERANCE_MS) {
        throw new Error("La hora de recogida ya ha pasado: elige una hora a partir de ahora");
      }

      const menuItems = await MenuItem.find({
        _id: { $in: args.items.map((i) => i.menuItemId) },
      });

      const lines = args.items.map((line) => {
        const item = menuItems.find((m) => m._id.toString() === line.menuItemId);
        if (!item) throw new Error(`Producto no encontrado: ${line.menuItemId}`);
        if (!item.available) throw new Error(`"${item.name}" no esta disponible ahora`);
        return {
          menuItemId: item._id,
          name: item.name,
          priceCents: item.priceCents,
          quantity: line.quantity,
        };
      });

      const totalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);

      // El indice unico de `code` es la garantia real; si coincide con uno existente se reintenta.
      let order;
      for (let attempt = 1; !order; attempt++) {
        try {
          order = await Order.create({
            code: generateOrderCode(),
            customerId,
            items: lines,
            totalCents,
            pickupSlot,
            status: "NUEVO",
          });
        } catch (err) {
          if (!isDuplicateCodeError(err) || attempt >= MAX_CODE_ATTEMPTS) throw err;
        }
      }

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      return order;
    },

    setOrderStatus: async (
      _: unknown,
      args: { id: string; status: OrderStatus },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["barra", "gestion"]);

      // La comprobacion del estado de origen va dentro del propio update: si dos personas
      // actuan a la vez sobre el mismo pedido, solo una lo consigue (y solo se emite un evento,
      // asi que no se suman sellos dos veces ni se exporta dos veces).
      const order = await Order.findOneAndUpdate(
        { _id: args.id, status: { $in: ALLOWED_FROM[args.status] } },
        // findOneAndUpdate no pasa por el hook pre("save"): updatedAt se fija aqui a mano.
        { status: args.status, updatedAt: new Date() },
        { new: true }
      );
      if (!order) {
        const current = await Order.findById(args.id).select("status code").lean();
        if (!current) throw new Error("Pedido no encontrado");
        throw new Error(
          `El pedido ${current.code} esta "${STATUS_LABELS[current.status]}" y no puede pasar a "${STATUS_LABELS[args.status]}"`
        );
      }

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      await ctx.pubsub.publish(EVENTS.ORDER_STATUS_CHANGED, { orderStatusChanged: order });

      // Fidelizacion y la exportacion a Google Sheets escuchan estos eventos por su cuenta:
      // "orders" no conoce ni importa nada de esos modulos.
      if (args.status === "ENTREGADO") {
        const payload = await buildClosedPayload(order, "ENTREGADO", order.updatedAt);
        internalEvents.emit(INTERNAL_EVENTS.ORDER_DELIVERED, payload);
      } else if (args.status === "CANCELADO") {
        const payload = await buildClosedPayload(order, "CANCELADO", order.updatedAt);
        internalEvents.emit(INTERNAL_EVENTS.ORDER_CANCELLED, payload);
      }

      return order;
    },
  },
  Subscription: {
    orderQueueUpdated: {
      subscribe: (_: unknown, __: unknown, ctx: GraphQLContext) => {
        requireStaff(ctx, ["barra", "gestion"]);
        return ctx.pubsub.asyncIterator(EVENTS.ORDER_QUEUE_UPDATED);
      },
    },
    orderStatusChanged: {
      subscribe: withFilter(
        (_: unknown, __: unknown, ctx: GraphQLContext) => {
          requireCustomer(ctx);
          return ctx.pubsub.asyncIterator(EVENTS.ORDER_STATUS_CHANGED);
        },
        // Solo llegan los pedidos del cliente autenticado (se filtra por el token, no por un
        // argumento que el cliente podria falsear).
        (payload, _variables, ctx: GraphQLContext) =>
          payload.orderStatusChanged.customerId.toString() === ctx.customerId
      ),
    },
  },
};
