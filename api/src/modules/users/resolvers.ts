import { Types } from "mongoose";
import { GraphQLContext, isActingCandidate, requireCustomer, requireOwnStaffSession, requireStaff } from "../../graphql/context";
import { User, StaffUser, hasCurrentConsent } from "./model";
import { requestOtp, verifyOtpAndIssueToken, loginStaff, loginStaffById, hashPassword, findExistingCustomer, signStaffToken, requestStaffPasswordReset, resetStaffPassword } from "./auth";
import { presetAvatarValue, removeAvatarFile } from "./avatar";
import { UPLOAD_DIR } from "../uploads/router";
import { MenuItem } from "../menu/model";
import { Order } from "../orders/model";
import { CashClosing } from "../cash/model";
import { Expense } from "../expenses/model";
import { LoyaltyTransaction } from "../loyalty/model";
import { StockMovement } from "../inventory/model";
import { NewsletterCampaign } from "../newsletter/model";

/**
 * Lo que queda a nombre de una cuenta del personal (pedidos que tomo, movio o cobro, cierres,
 * gastos...). Con algo de eso no se borra: el historial perderia quien lo hizo; se desactiva.
 */
async function staffRecords(staffId: string) {
  const id = new Types.ObjectId(staffId);
  const checks: [string, Promise<unknown>][] = [
    ["pedidos", Order.exists({ $or: [{ createdByStaffId: id }, { paidByStaffId: id }, { "statusHistory.staffId": id }] })],
    ["cierres de caja", CashClosing.exists({ staffId: id })],
    ["gastos", Expense.exists({ staffId: id })],
    ["movimientos de sellos", LoyaltyTransaction.exists({ staffId: id })],
    ["movimientos de inventario", StockMovement.exists({ staffId: id })],
    ["envíos de novedades", NewsletterCampaign.exists({ createdByStaffId: id })],
  ];
  const found = await Promise.all(checks.map(([, check]) => check));
  return checks.filter((_, i) => found[i]).map(([label]) => label);
}

const MAX_NAME_MATCHES = 8;

/** Filtro de codigo, telefono o email EXACTOS (lo que el cliente le dice al personal). */
function exactCustomerFilter(query: string) {
  const byCode = /^(lq-?)?\d{4}$/i.test(query) ? `LQ-${query.replace(/\D/g, "")}` : null;
  if (byCode) return [{ customerCode: byCode }];
  if (query.includes("@")) return [{ email: query.toLowerCase() }];
  return [{ phone: query }, { phone: query.replace(/[\s-]/g, "") }];
}

// "jose" encuentra "José": cada vocal (y la n) admite sus variantes con tilde.
const ACCENTS: Record<string, string> = { a: "aáàä", e: "eéèë", i: "iíìï", o: "oóòö", u: "uúùü", n: "nñ" };
function accentInsensitivePattern(text: string) {
  return [...text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")]
    .map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
}

function toMatch(user: { _id: Types.ObjectId; name: string; customerCode: string; avatar?: string | null }) {
  return { id: user._id.toString(), name: user.name, customerCode: user.customerCode, avatar: user.avatar ?? null };
}

export const usersResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.customerId) return null;
      return User.findById(ctx.customerId).exec();
    },
    // La cuenta con la que se entro; en una compartida, quien la usa va en actingAs.
    myStaffProfile: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.staff) return null;
      return StaffUser.findById(ctx.staff.accountId).exec();
    },
    myFavoriteMenuItemIds: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.customerId) return [];
      const user = await User.findById(ctx.customerId).select("favoriteMenuItemIds").lean();
      return (user?.favoriteMenuItemIds ?? []).map((id) => id.toString());
    },
    lookupCustomer: async (_: unknown, args: { query: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const query = args.query.trim();
      if (!query) return null;
      const user = await User.findOne({ $or: exactCustomerFilter(query), deletedAt: { $exists: false } })
        .select("name customerCode avatar")
        .lean();
      return user ? toMatch(user) : null;
    },
    searchCustomers: async (_: unknown, args: { query: string }, ctx: GraphQLContext) => {
      requireStaff(ctx, ["barra", "gestion"]);
      const query = args.query.trim().slice(0, 80);
      if (!query) return [];
      const exact = await User.findOne({ $or: exactCustomerFilter(query), deletedAt: { $exists: false } })
        .select("name customerCode avatar")
        .lean();
      if (exact) return [toMatch(exact)];
      // Por nombre solo con 3 letras o mas: con menos saldria media lista de clientes.
      if (query.replace(/[^\p{L}]/gu, "").length < 3) return [];
      const users = await User.find({
        name: { $regex: accentInsensitivePattern(query), $options: "i" },
        deletedAt: { $exists: false },
      })
        .select("name customerCode avatar")
        .sort({ name: 1 })
        .limit(MAX_NAME_MATCHES)
        .lean();
      return users.map(toMatch);
    },
    staffLoginOptions: async () => {
      const staff = await StaffUser.find({ active: { $ne: false } }).select("name avatar shared").sort({ name: 1 }).lean();
      return staff.map((s) => ({ id: s._id.toString(), name: s.name, avatar: s.avatar ?? null, shared: !!s.shared }));
    },
    actingStaffOptions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx);
      const staff = await StaffUser.find({ active: { $ne: false }, shared: { $ne: true } }).select("name avatar").sort({ name: 1 }).lean();
      return staff.map((s) => ({ id: s._id.toString(), name: s.name, avatar: s.avatar ?? null, shared: false }));
    },
    staffUsers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireOwnStaffSession(ctx, ["gestion"]);
      return StaffUser.find().sort({ name: 1 }).exec();
    },
    loginRequirements: async (_: unknown, args: { identifier: string }) => {
      const existing = await findExistingCustomer(args.identifier);
      return { askName: !existing, askPrivacyConsent: !(existing && hasCurrentConsent(existing)) };
    },
  },
  Staff: {
    deletable: async (doc: any) => (await staffRecords(doc._id.toString())).length === 0,
    shared: (doc: any) => !!doc.shared,
    // Solo en la propia sesion (myStaffProfile): quien esta usando la cuenta compartida.
    actingAs: (doc: any, _: unknown, ctx: GraphQLContext) => {
      const staff = ctx.staff;
      if (!staff || staff.id === staff.accountId || doc._id.toString() !== staff.accountId) return null;
      return StaffUser.findById(staff.id).exec();
    },
  },
  Mutation: {
    requestOtp: async (_: unknown, args: { identifier: string }) => {
      await requestOtp(args.identifier);
      return true;
    },
    verifyOtp: async (
      _: unknown,
      args: { identifier: string; code: string; name?: string; acceptPrivacyPolicy?: boolean; subscribeNewsletter?: boolean }
    ) => {
      const { token, user } = await verifyOtpAndIssueToken(
        args.identifier,
        args.code,
        args.name,
        args.acceptPrivacyPolicy === true,
        args.subscribeNewsletter === true
      );
      return { token, customer: user };
    },
    updateMyProfile: async (_: unknown, args: { name: string }, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const name = args.name.trim();
      if (!name) throw new Error("El nombre no puede estar vacio");
      if (name.length > 80) throw new Error("El nombre es demasiado largo");
      return User.findByIdAndUpdate(customerId, { name }, { new: true }).exec();
    },
    setMyAvatar: async (_: unknown, args: { preset?: string | null }, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const avatar = presetAvatarValue(args.preset);
      const update = avatar ? { $set: { avatar } } : { $unset: { avatar: 1 } };
      const previous = await User.findByIdAndUpdate(customerId, update).lean();
      if (!previous) throw new Error("Cuenta no encontrada");
      await removeAvatarFile(previous.avatar, UPLOAD_DIR);
      return User.findById(customerId).exec();
    },
    setFavoriteMenuItems: async (
      _: unknown,
      args: { menuItemIds: string[]; favorite: boolean },
      ctx: GraphQLContext
    ) => {
      const customerId = requireCustomer(ctx);
      if (args.menuItemIds.length > 20) throw new Error("Demasiados productos a la vez");
      let ids = args.menuItemIds.filter((id) => Types.ObjectId.isValid(id));
      // Al marcar, solo productos que existen; al desmarcar da igual (puede que ya se borraran).
      if (args.favorite) ids = (await MenuItem.find({ _id: { $in: ids } }).select("_id").lean()).map((m) => m._id.toString());
      const update = args.favorite
        ? { $addToSet: { favoriteMenuItemIds: { $each: ids } } }
        : { $pull: { favoriteMenuItemIds: { $in: ids } } };
      const user = await User.findByIdAndUpdate(customerId, update, { new: true }).select("favoriteMenuItemIds").lean();
      return (user?.favoriteMenuItemIds ?? []).map((id) => id.toString());
    },
    setStaffAvatar: async (_: unknown, args: { id: string; preset?: string | null }, ctx: GraphQLContext) => {
      requireOwnStaffSession(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Usuario no encontrado");
      const avatar = presetAvatarValue(args.preset);
      const update = avatar ? { $set: { avatar } } : { $unset: { avatar: 1 } };
      const previous = await StaffUser.findByIdAndUpdate(args.id, update).lean();
      if (!previous) throw new Error("Usuario no encontrado");
      await removeAvatarFile(previous.avatar, UPLOAD_DIR);
      return StaffUser.findById(args.id).exec();
    },
    setMyStaffAvatar: async (_: unknown, args: { preset?: string | null }, ctx: GraphQLContext) => {
      const staff = requireOwnStaffSession(ctx, ["barra", "gestion"]);
      const avatar = presetAvatarValue(args.preset);
      const update = avatar ? { $set: { avatar } } : { $unset: { avatar: 1 } };
      const previous = await StaffUser.findByIdAndUpdate(staff.id, update).lean();
      if (!previous) throw new Error("Usuario no encontrado");
      await removeAvatarFile(previous.avatar, UPLOAD_DIR);
      return StaffUser.findById(staff.id).exec();
    },
    staffLogin: async (_: unknown, args: { email: string; password: string }) => {
      const { token, staff } = await loginStaff(args.email, args.password);
      return { token, staff };
    },
    staffLoginById: async (_: unknown, args: { id: string; password: string }) => {
      const { token, staff } = await loginStaffById(args.id, args.password);
      return { token, staff };
    },
    requestStaffPasswordReset: (_: unknown, args: { id?: string | null; email?: string | null }) =>
      requestStaffPasswordReset(args),
    resetStaffPassword: async (
      _: unknown,
      args: { id?: string | null; email?: string | null; code: string; newPassword: string }
    ) => resetStaffPassword(args, args.code, args.newPassword),
    setActingStaff: async (_: unknown, args: { staffId: string }, ctx: GraphQLContext) => {
      const session = requireStaff(ctx);
      const account = await StaffUser.findById(session.accountId);
      if (!account?.shared) throw new Error("Solo en una cuenta compartida se elige quien la usa");
      if (!(await isActingCandidate(args.staffId))) throw new Error("Esa persona no puede usar la cuenta compartida");
      return { token: signStaffToken(account, args.staffId), staff: account };
    },
    createStaffUser: async (
      _: unknown,
      args: { name: string; email: string; password: string; role: "barra" | "gestion"; shared?: boolean | null },
      ctx: GraphQLContext
    ) => {
      requireOwnStaffSession(ctx, ["gestion"]);
      const email = args.email.toLowerCase().trim();
      const existing = await StaffUser.findOne({ email });
      if (existing) throw new Error("Ya existe un usuario con ese email");
      return StaffUser.create({
        name: args.name.trim(),
        email,
        passwordHash: await hashPassword(args.password),
        role: args.role,
        shared: !!args.shared,
      });
    },
    updateStaffUser: async (
      _: unknown,
      args: { id: string; name?: string; role?: "barra" | "gestion"; password?: string; active?: boolean; shared?: boolean | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireOwnStaffSession(ctx, ["gestion"]);
      const own = args.id === staff.id;
      if (own && args.role && args.role !== "gestion") {
        throw new Error("No puedes quitarte a ti mismo el rol de gestion");
      }
      if (own && args.active === false) {
        throw new Error("No puedes desactivar tu propia cuenta");
      }
      const update: Record<string, unknown> = {};
      if (args.name !== undefined) update.name = args.name.trim();
      if (args.role !== undefined) update.role = args.role;
      if (args.password) update.passwordHash = await hashPassword(args.password);
      if (typeof args.active === "boolean") update.active = args.active;
      if (typeof args.shared === "boolean") update.shared = args.shared;
      const updated = await StaffUser.findByIdAndUpdate(args.id, update, { new: true });
      if (!updated) throw new Error("Usuario no encontrado");
      return updated;
    },
    deleteStaffUser: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const staff = requireOwnStaffSession(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Usuario no encontrado");
      if (args.id === staff.id) throw new Error("No puedes borrar tu propia cuenta");
      const records = await staffRecords(args.id);
      if (records.length) {
        throw new Error(`Esta cuenta tiene ${records.join(", ")} a su nombre: no se puede borrar, desactívala`);
      }
      // Su sesion abierta deja de valer sola: el contexto exige que la cuenta exista.
      const deleted = await StaffUser.findByIdAndDelete(args.id);
      if (!deleted) throw new Error("Usuario no encontrado");
      await removeAvatarFile(deleted.avatar, UPLOAD_DIR);
      return true;
    },
  },
};
