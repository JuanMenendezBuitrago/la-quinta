import { GraphQLContext, requireCustomer } from "../../graphql/context";
import {
  internalEvents,
  INTERNAL_EVENTS,
  CustomerDeletedPayload,
  DELETED_CUSTOMER_NAME,
} from "../../config/events";
import { User } from "../users/model";
import { Order } from "../orders/model";
import { LoyaltyTransaction } from "../loyalty/model";

/**
 * Derechos del titular sobre sus datos. Es el unico modulo que lee de varios a la vez
 * (usuarios, pedidos, fidelizacion): reunir "todo lo de una persona" es transversal por naturaleza.
 */
export const privacyResolvers = {
  Query: {
    exportMyData: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const [user, orders, loyalty] = await Promise.all([
        User.findById(customerId).lean(),
        Order.find({ customerId }).sort({ createdAt: 1 }).lean(),
        LoyaltyTransaction.find({ customerId }).sort({ createdAt: 1 }).lean(),
      ]);
      if (!user) throw new Error("Cuenta no encontrada");
      const orderCodes = new Map(orders.map((o) => [o._id.toString(), o.code]));

      return JSON.stringify(
        {
          exportadoEl: new Date().toISOString(),
          cuenta: {
            nombre: user.name,
            email: user.email ?? null,
            telefono: user.phone ?? null,
            codigoCliente: user.customerCode,
            creadaEl: user.createdAt,
            autorizacionTratamientoDatos: user.privacyConsent
              ? { aceptadaEl: user.privacyConsent.acceptedAt, versionPolitica: user.privacyConsent.policyVersion }
              : null,
          },
          pedidos: orders.map((o) => ({
            codigo: o.code,
            estado: o.status,
            productos: o.items.map((i) => ({
              nombre: i.name,
              cantidad: i.quantity,
              precio: i.priceCents,
              opciones: (i.options ?? []).map((x) => `${x.groupName}: ${x.name}`),
            })),
            totalCOP: o.totalCents,
            recogida: o.pickupSlot,
            creadoEl: o.createdAt,
            actualizadoEl: o.updatedAt,
          })),
          sellos: loyalty.map((t) => ({
            sellos: t.stamps,
            motivo: t.reason,
            nota: t.note ?? null,
            pedido: t.orderId ? orderCodes.get(t.orderId.toString()) ?? null : null,
            fecha: t.createdAt,
          })),
          otrosTratamientos: [
            "Los pedidos entregados y cancelados se registran tambien en una hoja de calculo de Google " +
              "(codigo de pedido, codigo de cliente, nombre, productos, importes y fechas) para la contabilidad del local.",
          ],
        },
        null,
        2
      );
    },
  },
  Mutation: {
    deleteMyAccount: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const user = await User.findOneAndUpdate(
        { _id: customerId, deletedAt: { $exists: false } },
        {
          $set: { name: DELETED_CUSTOMER_NAME, deletedAt: new Date() },
          $unset: { email: 1, phone: 1, privacyConsent: 1 },
        },
        { new: true }
      );
      if (!user) throw new Error("Cuenta no encontrada");

      // La sesion deja de valer en la siguiente peticion (ver buildContextFromToken). Los pedidos
      // y los sellos no guardan datos personales propios: al anonimizar al usuario quedan anonimos.
      // La hoja de calculo si guarda el nombre: la anonimiza el modulo "sheets" con este evento.
      const payload: CustomerDeletedPayload = { customerId, customerCode: user.customerCode };
      internalEvents.emit(INTERNAL_EVENTS.CUSTOMER_DELETED, payload);
      return true;
    },
  },
};
