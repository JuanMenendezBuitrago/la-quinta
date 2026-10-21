import { Types } from "mongoose";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { User, StaffUser, hasCurrentConsent } from "./model";
import { requestOtp, verifyOtpAndIssueToken, loginStaff, loginStaffById, hashPassword, findExistingCustomer } from "./auth";
import { presetAvatarValue, removeAvatarFile } from "./avatar";
import { UPLOAD_DIR } from "../uploads/router";
import { MenuItem } from "../menu/model";

export const usersResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.customerId) return null;
      return User.findById(ctx.customerId).exec();
    },
    myStaffProfile: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.staff) return null;
      return StaffUser.findById(ctx.staff.id).exec();
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
      const byCode = /^(lq-?)?\d{4}$/i.test(query) ? `LQ-${query.replace(/\D/g, "")}` : null;
      const or: Record<string, string>[] = byCode
        ? [{ customerCode: byCode }]
        : query.includes("@")
          ? [{ email: query.toLowerCase() }]
          : [{ phone: query }, { phone: query.replace(/[\s-]/g, "") }];
      const user = await User.findOne({ $or: or, deletedAt: { $exists: false } })
        .select("name customerCode")
        .lean();
      return user ? { id: user._id.toString(), name: user.name, customerCode: user.customerCode } : null;
    },
    staffLoginOptions: async () => {
      const staff = await StaffUser.find({ active: { $ne: false } }).select("name avatar").sort({ name: 1 }).lean();
      return staff.map((s) => ({ id: s._id.toString(), name: s.name, avatar: s.avatar ?? null }));
    },
    staffUsers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return StaffUser.find().sort({ name: 1 }).exec();
    },
    loginRequirements: async (_: unknown, args: { identifier: string }) => {
      const existing = await findExistingCustomer(args.identifier);
      return { askName: !existing, askPrivacyConsent: !(existing && hasCurrentConsent(existing)) };
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
      requireStaff(ctx, ["gestion"]);
      if (!Types.ObjectId.isValid(args.id)) throw new Error("Usuario no encontrado");
      const avatar = presetAvatarValue(args.preset);
      const update = avatar ? { $set: { avatar } } : { $unset: { avatar: 1 } };
      const previous = await StaffUser.findByIdAndUpdate(args.id, update).lean();
      if (!previous) throw new Error("Usuario no encontrado");
      await removeAvatarFile(previous.avatar, UPLOAD_DIR);
      return StaffUser.findById(args.id).exec();
    },
    setMyStaffAvatar: async (_: unknown, args: { preset?: string | null }, ctx: GraphQLContext) => {
      const staff = requireStaff(ctx, ["barra", "gestion"]);
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
    createStaffUser: async (
      _: unknown,
      args: { name: string; email: string; password: string; role: "barra" | "gestion" },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const email = args.email.toLowerCase().trim();
      const existing = await StaffUser.findOne({ email });
      if (existing) throw new Error("Ya existe un usuario con ese email");
      return StaffUser.create({
        name: args.name.trim(),
        email,
        passwordHash: await hashPassword(args.password),
        role: args.role,
      });
    },
    updateStaffUser: async (
      _: unknown,
      args: { id: string; name?: string; role?: "barra" | "gestion"; password?: string; active?: boolean },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      if (args.id === staff.id && args.role && args.role !== "gestion") {
        throw new Error("No puedes quitarte a ti mismo el rol de gestion");
      }
      if (args.id === staff.id && args.active === false) {
        throw new Error("No puedes desactivar tu propia cuenta");
      }
      const update: Record<string, unknown> = {};
      if (args.name !== undefined) update.name = args.name.trim();
      if (args.role !== undefined) update.role = args.role;
      if (args.password) update.passwordHash = await hashPassword(args.password);
      if (typeof args.active === "boolean") update.active = args.active;
      const updated = await StaffUser.findByIdAndUpdate(args.id, update, { new: true });
      if (!updated) throw new Error("Usuario no encontrado");
      return updated;
    },
  },
};
