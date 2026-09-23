import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { User, StaffUser, hasCurrentConsent } from "./model";
import { requestOtp, verifyOtpAndIssueToken, loginStaff, hashPassword, findExistingCustomer } from "./auth";

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
      args: { identifier: string; code: string; name?: string; acceptPrivacyPolicy?: boolean }
    ) => {
      const { token, user } = await verifyOtpAndIssueToken(
        args.identifier,
        args.code,
        args.name,
        args.acceptPrivacyPolicy === true
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
    staffLogin: async (_: unknown, args: { email: string; password: string }) => {
      const { token, staff } = await loginStaff(args.email, args.password);
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
      args: { id: string; name?: string; role?: "barra" | "gestion"; password?: string },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      if (args.id === staff.id && args.role && args.role !== "gestion") {
        throw new Error("No puedes quitarte a ti mismo el rol de gestion");
      }
      const update: Record<string, unknown> = {};
      if (args.name !== undefined) update.name = args.name.trim();
      if (args.role !== undefined) update.role = args.role;
      if (args.password) update.passwordHash = await hashPassword(args.password);
      const updated = await StaffUser.findByIdAndUpdate(args.id, update, { new: true });
      if (!updated) throw new Error("Usuario no encontrado");
      return updated;
    },
  },
};
