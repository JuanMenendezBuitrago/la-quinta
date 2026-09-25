import { withFilter } from "graphql-subscriptions";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { ALLOWED_FROM, CUSTOMER_TABLES, Order, OrderStatus, PAYMENT_METHODS, PaymentMethod, STATUS_LABELS, ServiceType } from "./model";
import { tryComplete } from "./complete";
import { buildOrderLines, createWithUniqueCode, type OrderLineRequest } from "./create";
import { MenuItem } from "../menu/model";
import { User } from "../users/model";
import { EVENTS } from "../../config/pubsub";
import { internalEvents, INTERNAL_EVENTS } from "../../config/events";
import { buildClosedPayload } from "./closed";
import { getOpeningHours, staffOnlyOrders } from "../settings/resolvers";
import { pickupOutsideHoursReason } from "../settings/openingHours";

const ACTIVE_STATUSES: OrderStatus[] = ["NUEVO", "EN_PREPARACION", "LISTO"];
// De mesa o barra, ya servido pero sin cobrar: sigue en la cola, en "Por cobrar".
const AWAITING_PAYMENT = {
  status: "ENTREGADO",
  serviceType: "MESA",
  paidAt: { $exists: false },
  completedAt: { $exists: false },
};
// Aun no cerrado: se le puede asignar cliente (los sellos se suman al cerrar).
const OPEN_ORDER = { $or: [{ status: { $in: ACTIVE_STATUSES } }, AWAITING_PAYMENT] };

function iso(value: unknown) {
  return value ? new Date(value as string).toISOString() : null;
}
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
      return Order.find(OPEN_ORDER).sort({ createdAt: 1 }).exec();
    },
    orderHistory: async (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      // Cerrados o cancelados: lo servido sin cobrar sigue en la cola, no aqui.
      return Order.find({ $or: [{ status: "CANCELADO" }, { status: "ENTREGADO", completedAt: { $exists: true } }] })
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
    deliveredAt: (doc: any) => iso(doc.deliveredAt),
    paidAt: (doc: any) => iso(doc.paidAt),
    paymentMethod: (doc: any) => doc.paymentMethod ?? null,
    awaitingPayment: (doc: any) =>
      doc.serviceType === "MESA" && !doc.paidAt && !doc.completedAt && doc.status !== "CANCELADO",
  },
  OrderLine: {
    // Pedidos anteriores a las personalizaciones: sin opciones.
    options: (line: any) => line.options ?? [],
    imageUrl: async (line: any) => {
      const item = await MenuItem.findById(line.menuItemId).select("imageUrl").lean();
      return item?.imageUrl ?? null;
    },
  },
  Mutation: {
    createOrder: async (
      _: unknown,
      args: { items: OrderLineRequest[]; pickupSlot?: string | null; table?: string | null },
      ctx: GraphQLContext
    ) => {
      const customerId = requireCustomer(ctx);
      if (await staffOnlyOrders()) {
        throw new Error("Ahora mismo los pedidos se hacen con el personal del local, no desde la web");
      }
      if (args.items.length === 0) throw new Error("El pedido no puede estar vacio");

      const table = args.table?.trim() || null;
      let pickupSlot: Date;
      if (table) {
        // Pide desde el local: se sirve en su mesa ahora mismo, siempre que la tienda este abierta
        // (que no se pueda "pedir a la mesa 3" desde casa con la tienda cerrada).
        if (!CUSTOMER_TABLES.includes(table)) throw new Error("Esa mesa no existe");
        pickupSlot = new Date();
        if (pickupOutsideHoursReason(pickupSlot, await getOpeningHours())) {
          throw new Error("Ahora la tienda esta cerrada: no se pueden hacer pedidos en mesa");
        }
      } else {
        if (!args.pickupSlot) throw new Error("Elige la hora de recogida");
        pickupSlot = new Date(args.pickupSlot);
        if (Number.isNaN(pickupSlot.getTime())) throw new Error("La hora de recogida no es valida");
        if (pickupSlot.getTime() < Date.now() - PICKUP_PAST_TOLERANCE_MS) {
          throw new Error("La hora de recogida ya ha pasado: elige una hora a partir de ahora");
        }
        const closedReason = pickupOutsideHoursReason(pickupSlot, await getOpeningHours());
        if (closedReason) throw new Error(closedReason);
      }

      const { lines, totalCents } = await buildOrderLines(args.items);
      const order = await createWithUniqueCode({
        customerId: customerId as any,
        source: "WEB",
        // En mesa se cobra aparte, como los pedidos de mesa que toma el personal (requiresPayment).
        ...(table ? { serviceType: "MESA" as const, table } : {}),
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
          items: OrderLineRequest[];
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

      // Solo pedidos sin cerrar y sin cliente: asi los sellos van a su cuenta al cerrarlo, y no se
      // puede "robar" un pedido que ya es de otro cliente.
      const order = await Order.findOneAndUpdate(
        { _id: args.orderId, customerId: null, ...OPEN_ORDER },
        { customerId: args.customerId, updatedAt: new Date() },
        { new: true }
      );
      if (!order) {
        const current = await Order.findById(args.orderId).select("status customerId").lean();
        if (!current) throw new Error("Pedido no encontrado");
        if (current.customerId) throw new Error("El pedido ya tiene un cliente asignado");
        throw new Error("Solo se puede asignar cliente a un pedido que no se ha cerrado ni cancelado");
      }

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      return order;
    },

    markOrderPaid: async (
      _: unknown,
      args: { id: string; method: PaymentMethod },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      if (!PAYMENT_METHODS.includes(args.method)) throw new Error("Metodo de pago no valido");

      // Atomico, como setOrderStatus: si dos personas cobran a la vez, solo una lo consigue.
      const now = new Date();
      const order = await Order.findOneAndUpdate(
        { _id: args.id, serviceType: "MESA", paidAt: { $exists: false }, status: { $ne: "CANCELADO" } },
        { $set: { paidAt: now, paymentMethod: args.method, paidByStaffId: staff.id, updatedAt: now } },
        { new: true }
      );
      if (!order) {
        const current = await Order.findById(args.id).select("code serviceType paidAt status").lean();
        if (!current) throw new Error("Pedido no encontrado");
        if (current.serviceType !== "MESA") throw new Error("Solo los pedidos de mesa o barra se cobran aparte");
        if (current.paidAt) throw new Error(`El pedido ${current.code} ya esta cobrado`);
        throw new Error(`El pedido ${current.code} esta cancelado`);
      }

      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      await tryComplete(order._id.toString());
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
      const now = new Date();
      const filter: Record<string, unknown> = { _id: args.id, status: { $in: ALLOWED_FROM[args.status] } };
      if (args.status === "CANCELADO") {
        // Ademas de lo activo, lo servido en mesa sin cobrar (p. ej. se fue sin pagar).
        delete filter.status;
        filter.$or = [{ status: { $in: ALLOWED_FROM.CANCELADO } }, AWAITING_PAYMENT];
      }
      const order = await Order.findOneAndUpdate(
        filter,
        // findOneAndUpdate no pasa por el hook pre("save"): updatedAt se fija aqui a mano.
        { status: args.status, updatedAt: now, ...(args.status === "ENTREGADO" ? { deliveredAt: now } : {}) },
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

      // Inventario, fidelizacion y la exportacion a Google Sheets escuchan estos eventos por su
      // cuenta: "orders" no conoce ni importa nada de esos modulos. Al entregar sale la mercancia
      // (inventario); los sellos y la hoja esperan al cierre, que en mesa exige ademas el cobro.
      if (args.status === "ENTREGADO") {
        const payload = await buildClosedPayload(order, "ENTREGADO", now);
        internalEvents.emit(INTERNAL_EVENTS.ORDER_DELIVERED, payload);
        await tryComplete(order._id.toString());
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
