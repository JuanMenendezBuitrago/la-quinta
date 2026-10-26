import { withFilter } from "graphql-subscriptions";
import { Types } from "mongoose";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { ALLOWED_FROM, AWAITING_PAYMENT, CUSTOMER_TABLES, OPEN_ORDER, isTakeaway, Order, OrderDiscountDoc, OrderStatus, PAYMENT_METHODS, PaymentMethod, STATUS_LABELS, ServiceType } from "./model";
import { tryComplete } from "./complete";
import { buildOrderLines, createWithUniqueCode, type OrderLineRequest } from "./create";
import { buildDiscount, buildRedemption, rebaseDiscount, type OrderDiscountInput, type OrderRedemptionInput } from "./discount";
import { assertRewardAvailable, redeemForOrder, refundOrderRedemption } from "../loyalty/redemption";
import { MenuItem } from "../menu/model";
import { StaffUser, User } from "../users/model";
import { EVENTS } from "../../config/pubsub";
import { internalEvents, INTERNAL_EVENTS } from "../../config/events";
import { buildClosedPayload } from "./closed";
import { getOpeningHours, orderQueueEnabled, packagingFeeCents, staffOnlyOrders } from "../settings/resolvers";
import { pickupOutsideHoursReason } from "../settings/openingHours";


function iso(value: unknown) {
  return value ? new Date(value as string).toISOString() : null;
}
// Ventana de "los mas pedidos": lo reciente, para que siga a los cambios de carta y de temporada.
const TOP_ITEMS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// Margen para relojes algo desfasados y para el rato que el cliente pasa en el carrito.
const PICKUP_PAST_TOLERANCE_MS = 5 * 60 * 1000;

/** El descuento que pide el panel es el mismo que ya tiene el pedido (solo se toco el canje). */
function sameDiscount(current: OrderDiscountDoc | null | undefined, input: OrderDiscountInput) {
  if (!current || current.reason !== input.reason || (current.note || null) !== (input.note?.trim() || null)) return false;
  return current.percent ? current.percent === input.percent : !input.percent && current.amountCents === input.amountCents;
}

async function activeCustomerExists(customerId: string) {
  return !!(await User.exists({ _id: customerId, deletedAt: { $exists: false } }));
}

async function staffNameOf(staffId: unknown) {
  if (!staffId) return null;
  const who = await StaffUser.findById(staffId).select("name").lean();
  return who?.name ?? null;
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
    orderHistory: async (
      _: unknown,
      args: { limit?: number; from?: string | null; to?: string | null; staffId?: string | null; customerId?: string | null },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["barra", "gestion"]);
      // Cerrados o cancelados: lo servido sin cobrar sigue en la cola, no aqui.
      const filter: Record<string, unknown> = {
        $or: [{ status: "CANCELADO" }, { status: "ENTREGADO", completedAt: { $exists: true } }],
      };
      const date = (value: string, label: string) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) throw new Error(`Fecha ${label} no valida`);
        return d;
      };
      if (args.from || args.to) {
        filter.updatedAt = {
          ...(args.from ? { $gte: date(args.from, "desde") } : {}),
          ...(args.to ? { $lt: date(args.to, "hasta") } : {}),
        };
      }
      const id = (value: string) => {
        if (!Types.ObjectId.isValid(value)) throw new Error("Identificador no valido");
        return new Types.ObjectId(value);
      };
      // Quien lo tomo o le cambio el estado en algun momento (el alta del personal tambien queda ahi).
      if (args.staffId) filter["statusHistory.staffId"] = id(args.staffId);
      if (args.customerId) filter.customerId = id(args.customerId);
      const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
      return Order.find(filter).sort({ updatedAt: -1 }).limit(limit).exec();
    },
    topMenuItems: async (_: unknown, args: { limit?: number | null }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
      const rows = await Order.aggregate<{ _id: Types.ObjectId }>([
        { $match: { status: { $ne: "CANCELADO" }, createdAt: { $gte: new Date(Date.now() - TOP_ITEMS_WINDOW_MS) } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.menuItemId", units: { $sum: "$items.quantity" } } },
        { $sort: { units: -1, _id: 1 } },
        { $limit: limit },
      ]);
      return rows.map((r) => r._id.toString());
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
    packagingCents: (doc: any) => doc.packagingCents ?? 0,
    takeaway: (doc: any) => isTakeaway(doc),
    // Una sola consulta por pedido para el nombre y el avatar del personal que hizo cada cambio.
    statusHistory: async (doc: any) => {
      const history: any[] = doc.statusHistory ?? [];
      const staffIds = [...new Set(history.map((h) => h.staffId?.toString()).filter(Boolean))];
      const staff = staffIds.length ? await StaffUser.find({ _id: { $in: staffIds } }).select("name avatar").lean() : [];
      const staffById = new Map(staff.map((s) => [s._id.toString(), s]));
      return history.map((h) => {
        const who = h.staffId ? staffById.get(h.staffId.toString()) : undefined;
        return {
          status: h.status,
          at: new Date(h.at).toISOString(),
          staffName: who?.name ?? null,
          staffAvatar: who?.avatar ?? null,
        };
      });
    },
    redemption: (doc: any) => doc.redemption ?? null,
    discount: (doc: any) => doc.discount ?? null,
    paidAt: (doc: any) => iso(doc.paidAt),
    paymentMethod: (doc: any) => doc.paymentMethod ?? null,
    awaitingPayment: (doc: any) =>
      doc.serviceType === "MESA" && !doc.paidAt && !doc.completedAt && doc.status !== "CANCELADO",
  },
  OrderDiscount: {
    note: (d: any) => d.note || null,
    percent: (d: any) => d.percent ?? null,
    staffName: (d: any) => staffNameOf(d.staffId),
  },
  OrderRedemption: {
    staffName: (r: any) => staffNameOf(r.staffId),
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
      // Sin cola nadie veria el pedido para prepararlo: tampoco se acepta desde la web.
      if ((await staffOnlyOrders()) || !(await orderQueueEnabled())) {
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
      // Recogida en tienda = para llevar: lleva el recargo por empaque. En mesa, no.
      const packagingCents = table ? 0 : await packagingFeeCents();
      const order = await createWithUniqueCode({
        customerId: customerId as any,
        source: "WEB",
        // En mesa se cobra aparte, como los pedidos de mesa que toma el personal (requiresPayment).
        ...(table ? { serviceType: "MESA" as const, table } : {}),
        items: lines,
        totalCents: totalCents + packagingCents,
        packagingCents,
        takeaway: !table,
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
          takeaway?: boolean | null;
          paymentMethod?: PaymentMethod | null;
          redemption?: OrderRedemptionInput | null;
          discount?: OrderDiscountInput | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      const { input } = args;
      const table = input.table?.trim() || undefined;
      if (input.serviceType === "MESA" && !table) throw new Error("Indica el numero de mesa");
      if (input.customerId && !(await activeCustomerExists(input.customerId))) throw new Error("Cliente no encontrado");
      // Guardar y pagar: se sirvio sin pasar por la cola y se cobra ahora.
      const paidNow = !!input.paymentMethod;
      if (paidNow && !PAYMENT_METHODS.includes(input.paymentMethod!)) throw new Error("Metodo de pago no valido");
      if (!paidNow && !(await orderQueueEnabled())) {
        throw new Error("La cola de pedidos esta desactivada: usa \"Guardar y pagar\"");
      }

      const { lines, totalCents } = await buildOrderLines(input.items);
      // Mesa o barra con "para llevar" marcado: se empaqueta igual que un pedido para llevar.
      const takeaway = input.serviceType === "LLEVAR" || input.takeaway === true;
      const packagingCents = takeaway ? await packagingFeeCents() : 0;
      // Lo toma el personal en el local: la recogida es ahora y no se valida contra el horario.
      const now = new Date();
      // Primero el canje; el descuento, sobre lo que queda.
      const redemption = input.redemption ? buildRedemption(input.redemption, lines, staff, now) : null;
      const baseCents = totalCents + packagingCents - (redemption?.amountCents ?? 0);
      const discount = input.discount ? buildDiscount(input.discount, baseCents, staff, now) : null;
      const redeems = !!redemption;
      if (redeems) {
        if (!input.customerId) throw new Error("Para canjear sellos, identifica antes al cliente");
        await assertRewardAvailable(input.customerId);
      }
      const order = await createWithUniqueCode({
        customerId: (input.customerId || null) as any,
        source: "STAFF",
        serviceType: input.serviceType,
        table: input.serviceType === "MESA" ? table : undefined,
        note: input.note?.trim() || undefined,
        createdByStaffId: staff.id as any,
        items: lines,
        totalCents: baseCents - (discount?.amountCents ?? 0),
        packagingCents,
        ...(redemption ? { redemption } : {}),
        ...(discount ? { discount } : {}),
        takeaway,
        pickupSlot: now,
        // Guardar y pagar: creado, entregado, cobrado y cerrado en el mismo instante.
        createdAt: now,
        status: paidNow ? "ENTREGADO" : "NUEVO",
        ...(paidNow
          ? { deliveredAt: now, paidAt: now, paymentMethod: input.paymentMethod!, paidByStaffId: staff.id as any }
          : {}),
      });

      // Antes del cierre: al cerrar, el producto canjeado ya no suma sello (ver loyalty/listeners.ts).
      if (redeems) await redeemForOrder(input.customerId!, order._id.toString(), staff.id);
      await ctx.pubsub.publish(EVENTS.ORDER_QUEUE_UPDATED, { orderQueueUpdated: order });
      // Como al entregarlo desde la cola: sale la mercancia y, ya cobrado, se cierra (sellos y hoja).
      if (paidNow) {
        internalEvents.emit(INTERNAL_EVENTS.ORDER_DELIVERED, await buildClosedPayload(order, "ENTREGADO", now));
        await tryComplete(order._id.toString(), now);
      }
      return order;
    },

    assignOrderCustomer: async (
      _: unknown,
      args: { orderId: string; customerId: string },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["barra", "gestion"]);
      if (!(await activeCustomerExists(args.customerId))) throw new Error("Cliente no encontrado");

      // Solo pedidos sin cerrar (OPEN_ORDER) y sin cliente: asi los sellos van a su cuenta al
      // cerrarlo, y no se puede "robar" un pedido que ya es de otro cliente.
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

    setOrderDiscounts: async (
      _: unknown,
      args: { id: string; redemption?: OrderRedemptionInput | null; discount?: OrderDiscountInput | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      // Solo antes de cobrarlo: lo cobrado ya cuenta en la caja tal cual.
      const unpaid = { paidAt: { $exists: false }, completedAt: { $exists: false }, status: { $ne: "CANCELADO" } };
      const current = await Order.findOne({ _id: args.id, ...unpaid })
        .select("totalCents discount redemption customerId items")
        .lean();
      if (!current) {
        const order = await Order.findById(args.id).select("code status").lean();
        if (!order) throw new Error("Pedido no encontrado");
        if (order.status === "CANCELADO") throw new Error(`El pedido ${order.code} esta cancelado`);
        throw new Error(`El pedido ${order.code} ya esta cobrado: no se puede cambiar el descuento`);
      }
      // Lo que vale el pedido sin canje ni descuento (el total guardado ya los lleva restados).
      const grossCents = current.totalCents + (current.discount?.amountCents ?? 0) + (current.redemption?.amountCents ?? 0);
      const now = new Date();

      // El canje que ya tenia se conserva tal cual si no cambia el producto.
      const keepRedemption =
        !!current.redemption && (args.redemption?.lineIndex ?? current.redemption.lineIndex) === current.redemption.lineIndex;
      const redemption = args.redemption
        ? keepRedemption
          ? current.redemption!
          : buildRedemption(args.redemption, current.items, staff, now)
        : null;
      const baseCents = grossCents - (redemption?.amountCents ?? 0);
      // El descuento que ya tenia (p. ej. al poner solo el canje) se recalcula sobre lo que queda, sin
      // volver a pasar por el tope de barra: lo comprobo quien lo aplico.
      const discount = args.discount
        ? sameDiscount(current.discount, args.discount)
          ? rebaseDiscount(current.discount!, baseCents)
          : buildDiscount(args.discount, baseCents, staff, now)
        : null;

      // Sellos: se restan antes de aplicar el canje (y se devuelven si no se aplica), y se devuelven
      // al quitarlo. Cambiar solo el producto no los toca.
      const customerId = current.customerId?.toString();
      const wasRedeemed = !!current.redemption;
      const redeems = !!redemption;
      if (redeems && !wasRedeemed) {
        if (!customerId) throw new Error("Para canjear sellos, asocia antes el pedido a un cliente");
        await assertRewardAvailable(customerId);
        await redeemForOrder(customerId, args.id, staff.id);
      }

      const unset: Record<string, 1> = {};
      if (!redemption) unset.redemption = 1;
      if (!discount) unset.discount = 1;
      // Atomico: si entretanto se cobro o cambio el total, no se aplica sobre cifras viejas.
      const order = await Order.findOneAndUpdate(
        { _id: args.id, ...unpaid, totalCents: current.totalCents },
        {
          $set: {
            ...(redemption ? { redemption } : {}),
            ...(discount ? { discount } : {}),
            totalCents: baseCents - (discount?.amountCents ?? 0),
            updatedAt: now,
          },
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true }
      );
      if (!order) {
        if (redeems && !wasRedeemed) await refundOrderRedemption(customerId!, args.id, "Canje no aplicado: devuelto", staff.id);
        throw new Error("El pedido acaba de cambiar: vuelve a intentarlo");
      }
      if (wasRedeemed && !redeems && customerId) {
        await refundOrderRedemption(customerId, args.id, "Canje quitado: sellos devueltos", staff.id);
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
      args: { id: string; status: OrderStatus; paymentMethod?: PaymentMethod | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
      // Cobro al entregar (pedidos para llevar o web): el metodo se guarda en el mismo update.
      const paidOnDelivery = !!args.paymentMethod;
      if (paidOnDelivery && (args.status !== "ENTREGADO" || !PAYMENT_METHODS.includes(args.paymentMethod!))) {
        throw new Error("El metodo de pago solo se indica al entregar un pedido que no es de mesa");
      }

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
      // Los de mesa se cobran aparte (markOrderPaid), antes o despues de entregar.
      if (paidOnDelivery) filter.serviceType = { $ne: "MESA" };
      const order = await Order.findOneAndUpdate(
        filter,
        // findOneAndUpdate no pasa por el hook pre("save"): updatedAt se fija aqui a mano.
        {
          $set: {
            status: args.status,
            updatedAt: now,
            ...(args.status === "ENTREGADO" ? { deliveredAt: now } : {}),
            ...(paidOnDelivery ? { paidAt: now, paymentMethod: args.paymentMethod, paidByStaffId: staff.id } : {}),
          },
          $push: { statusHistory: { status: args.status, at: now, staffId: staff.id } },
        },
        { new: true }
      );
      if (!order) {
        const current = await Order.findById(args.id).select("status code serviceType").lean();
        if (!current) throw new Error("Pedido no encontrado");
        if (paidOnDelivery && current.serviceType === "MESA") {
          throw new Error(`El pedido ${current.code} es de mesa: se cobra aparte`);
        }
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
