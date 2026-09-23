import { withFilter } from "graphql-subscriptions";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { ALLOWED_FROM, Order, OrderStatus, STATUS_LABELS, ServiceType } from "./model";
import { buildOrderLines, createWithUniqueCode } from "./create";
import { MenuItem } from "../menu/model";
import { User } from "../users/model";
import { EVENTS } from "../../config/pubsub";
import { internalEvents, INTERNAL_EVENTS } from "../../config/events";
import { buildClosedPayload } from "./closed";
import { getOpeningHours } from "../settings/resolvers";
import { pickupOutsideHoursReason } from "../settings/openingHours";

const ACTIVE_STATUSES: OrderStatus[] = ["NUEVO", "EN_PREPARACION", "LISTO"];
// Margen para relojes algo desfasados y para el rato que el cliente pasa en el carrito.
const PICKUP_PAST_TOLERANCE_MS = 5 * 60 * 1000;

async function activeCustomerExists(customerId: string) {
  return !!(await User.exists({ _id: customerId, deletedAt: { $exists: false } }));
}

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
    customer: (doc: any) => (doc.customerId ? User.findById(doc.customerId).exec() : null),
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
      const closedReason = pickupOutsideHoursReason(pickupSlot, await getOpeningHours());
      if (closedReason) throw new Error(closedReason);

      const { lines, totalCents } = await buildOrderLines(args.items);
      const order = await createWithUniqueCode({
        customerId: customerId as any,
        source: "WEB",
        items: lines,
        totalCents,
        pickupSlot,
        status: "NUEVO",
      });

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      return order;
    },

    createStaffOrder: async (
      _: unknown,
      args: {
        input: {
          items: { menuItemId: string; quantity: number }[];
          serviceType: ServiceType;
          table?: string | null;
          customerId?: string | null;
          note?: string | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      const { input } = args;
      const table = input.table?.trim() || undefined;
      if (input.serviceType === "MESA" && !table) throw new Error("Indica el numero de mesa");
      if (input.customerId && !(await activeCustomerExists(input.customerId))) throw new Error("Cliente no encontrado");

      const { lines, totalCents } = await buildOrderLines(input.items);
      // Lo toma el personal en el local: la recogida es ahora y no se valida contra el horario.
      const order = await createWithUniqueCode({
        customerId: (input.customerId || null) as any,
        source: "STAFF",
        serviceType: input.serviceType,
        table: input.serviceType === "MESA" ? table : undefined,
        note: input.note?.trim() || undefined,
        createdByStaffId: staff.id as any,
        items: lines,
        totalCents,
        pickupSlot: new Date(),
        status: "NUEVO",
      });

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      return order;
    },

    assignOrderCustomer: async (
      _: unknown,
      args: { orderId: string; customerId: string },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["barra", "gestion"]);
      if (!(await activeCustomerExists(args.customerId))) throw new Error("Cliente no encontrado");

      // Solo pedidos activos y sin cliente: asi los sellos van a su cuenta al entregarlo, y no se
      // puede "robar" un pedido que ya es de otro cliente.
      const order = await Order.findOneAndUpdate(
        { _id: args.orderId, status: { $in: ACTIVE_STATUSES }, customerId: null },
        { customerId: args.customerId, updatedAt: new Date() },
        { new: true }
      );
      if (!order) {
        const current = await Order.findById(args.orderId).select("status customerId").lean();
        if (!current) throw new Error("Pedido no encontrado");
        if (current.customerId) throw new Error("El pedido ya tiene un cliente asignado");
        throw new Error("Solo se puede asignar cliente a un pedido que no se ha entregado ni cancelado");
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
          !!payload.orderStatusChanged.customerId &&
          payload.orderStatusChanged.customerId.toString() === ctx.customerId
      ),
    },
  },
};
