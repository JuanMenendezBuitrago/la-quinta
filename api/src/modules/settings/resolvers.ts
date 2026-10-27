import { GraphQLContext, requireStaff } from "../../graphql/context";
import { DEFAULT_PACKAGING_FEE_CENTS, DEFAULT_REWARD_THRESHOLD_STAMPS, DEFAULT_STAMPS_RULE, STAMPS_MODES, SiteSettings, StampsMode } from "./model";
import { OPEN_ORDER, Order } from "../orders/model";
import { OpeningHoursDoc, scheduleLines, validateOpeningHours } from "./openingHours";

// upsert sin filtro: si nadie ha guardado nunca la configuracion, crea el documento con
// los valores por defecto del modelo (los mismos que llevaba el footer a mano) en vez de
// devolver null y obligar al frontend a manejar ese caso.
function loadSettings() {
  return SiteSettings.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
}

/** Horario de apertura vigente. Lo usa "orders" para validar las horas de recogida. */
export async function getOpeningHours(): Promise<OpeningHoursDoc[]> {
  return (await loadSettings()).openingHours;
}

/** Si esta activo, solo el personal puede crear pedidos. Lo usa "orders" en createOrder. */
export async function staffOnlyOrders(): Promise<boolean> {
  return !!(await loadSettings()).staffOnlyOrders;
}

/** Si la cola de pedidos esta activa. Lo usa "orders" al crear pedidos. */
export async function orderQueueEnabled(): Promise<boolean> {
  return (await loadSettings()).orderQueueEnabled !== false;
}

/** Recargo por empaque vigente. Lo usa "orders" al crear un pedido para llevar. */
export async function packagingFeeCents(): Promise<number> {
  return (await loadSettings()).packagingFeeCents ?? DEFAULT_PACKAGING_FEE_CENTS;
}

/**
 * Sellos para canjear la recompensa. Lo usa "loyalty": al canjear se restan estos, y cambiarlo no
 * toca los sellos ya ganados ni los canjes hechos (al deshacer uno se devuelve lo que se resto).
 */
export async function rewardThresholdStamps(): Promise<number> {
  return (await loadSettings()).rewardThresholdStamps ?? DEFAULT_REWARD_THRESHOLD_STAMPS;
}

/** Como se ganan los sellos. Lo usa "loyalty" al cerrar un pedido. */
export async function stampsRule() {
  const doc = await loadSettings();
  return {
    mode: (doc.stampsMode ?? DEFAULT_STAMPS_RULE.stampsMode) as StampsMode,
    perOrder: doc.stampsPerOrder ?? DEFAULT_STAMPS_RULE.stampsPerOrder,
    perItem: doc.stampsPerItem ?? DEFAULT_STAMPS_RULE.stampsPerItem,
    amountCents: doc.stampsAmountCents ?? DEFAULT_STAMPS_RULE.stampsAmountCents,
  };
}

// Topes de cordura de los sellos que se ganan.
const MAX_STAMPS_PER_ORDER_OR_ITEM = 10;
const MIN_STAMPS_AMOUNT_CENTS = 1_000;
const MAX_STAMPS_AMOUNT_CENTS = 1_000_000;

function isIntBetween(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

// Tope de cordura para el recargo (como los importes del cierre de caja).
const MAX_PACKAGING_FEE_CENTS = 100_000;
// Y para los sellos del canje: con mas, la tarjeta de la cuenta del cliente no se podria leer.
const MAX_REWARD_THRESHOLD_STAMPS = 50;

export const settingsResolvers = {
  Query: {
    siteSettings: () => loadSettings(),
  },
  SiteSettings: {
    openingHours: (doc: any) => [...doc.openingHours].sort((a: OpeningHoursDoc, b: OpeningHoursDoc) => a.weekday - b.weekday),
    schedule: (doc: any) => scheduleLines(doc.openingHours),
    // Documentos guardados antes de existir el campo: sin valor equivale a desactivado.
    staffOnlyOrders: (doc: any) => !!doc.staffOnlyOrders,
    orderQueueEnabled: (doc: any) => doc.orderQueueEnabled !== false,
    showInactiveStaff: (doc: any) => doc.showInactiveStaff !== false,
    packagingFeeCents: (doc: any) => doc.packagingFeeCents ?? DEFAULT_PACKAGING_FEE_CENTS,
    ticketPrintingEnabled: (doc: any) => !!doc.ticketPrintingEnabled,
    rewardThresholdStamps: (doc: any) => doc.rewardThresholdStamps ?? DEFAULT_REWARD_THRESHOLD_STAMPS,
    stampsMode: (doc: any) => doc.stampsMode ?? DEFAULT_STAMPS_RULE.stampsMode,
    stampsPerOrder: (doc: any) => doc.stampsPerOrder ?? DEFAULT_STAMPS_RULE.stampsPerOrder,
    stampsPerItem: (doc: any) => doc.stampsPerItem ?? DEFAULT_STAMPS_RULE.stampsPerItem,
    stampsAmountCents: (doc: any) => doc.stampsAmountCents ?? DEFAULT_STAMPS_RULE.stampsAmountCents,
  },
  Mutation: {
    updateSiteSettings: async (_: unknown, args: { input: Record<string, unknown> }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      if (args.input.openingHours) {
        const problem = validateOpeningHours(args.input.openingHours as OpeningHoursDoc[]);
        if (problem) throw new Error(problem);
      }
      const fee = args.input.packagingFeeCents;
      if (fee != null && (!Number.isInteger(fee) || (fee as number) < 0 || (fee as number) > MAX_PACKAGING_FEE_CENTS)) {
        throw new Error("Recargo por empaque no valido");
      }
      const threshold = args.input.rewardThresholdStamps;
      if (
        threshold != null &&
        (!Number.isInteger(threshold) || (threshold as number) < 1 || (threshold as number) > MAX_REWARD_THRESHOLD_STAMPS)
      ) {
        throw new Error(`Los sellos para canjear tienen que ser un número entre 1 y ${MAX_REWARD_THRESHOLD_STAMPS}`);
      }
      const { stampsMode, stampsPerOrder, stampsPerItem, stampsAmountCents } = args.input;
      if (stampsMode != null && !STAMPS_MODES.includes(stampsMode as StampsMode)) {
        throw new Error("Forma de ganar sellos no valida");
      }
      for (const [value, what] of [[stampsPerOrder, "por pedido"], [stampsPerItem, "por producto"]] as const) {
        if (value != null && !isIntBetween(value, 1, MAX_STAMPS_PER_ORDER_OR_ITEM)) {
          throw new Error(`Los sellos ${what} tienen que ser un número entre 1 y ${MAX_STAMPS_PER_ORDER_OR_ITEM}`);
        }
      }
      if (stampsAmountCents != null && !isIntBetween(stampsAmountCents, MIN_STAMPS_AMOUNT_CENTS, MAX_STAMPS_AMOUNT_CENTS)) {
        throw new Error(
          `El importe por sello tiene que estar entre ${MIN_STAMPS_AMOUNT_CENTS.toLocaleString("es-CO")} y ${MAX_STAMPS_AMOUNT_CENTS.toLocaleString("es-CO")} pesos`
        );
      }
      // Apagar la cola con pedidos dentro los dejaria escondidos, sin forma de entregarlos ni cobrarlos.
      if (args.input.orderQueueEnabled === false) {
        const open = await Order.countDocuments(OPEN_ORDER);
        if (open) {
          throw new Error(
            open === 1
              ? "Queda 1 pedido en la cola: entrégalo y cóbralo, o cancélalo, antes de desactivarla"
              : `Quedan ${open} pedidos en la cola: entrégalos y cóbralos, o cancélalos, antes de desactivarla`
          );
        }
      }
      const update: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args.input)) {
        // null en un booleano no significa "borrar": se ignora como si no viniera.
        if (
          (key === "staffOnlyOrders" || key === "orderQueueEnabled" || key === "showInactiveStaff" || key === "packagingFeeCents" || key === "ticketPrintingEnabled" || key === "rewardThresholdStamps" ||
            key === "stampsMode" || key === "stampsPerOrder" || key === "stampsPerItem" || key === "stampsAmountCents") &&
          value === null
        ) continue;
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
