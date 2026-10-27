import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Types } from "mongoose";
import { GraphQLContext, requireCustomer, requireStaff } from "../../graphql/context";
import { UPLOAD_DIR } from "../uploads/router";
import { MenuItem } from "../menu/model";
import { Order } from "../orders/model";
import { StaffUser, User } from "../users/model";
import { awardPhotoStamp } from "../loyalty/redemption";
import { removeImageIfUnused } from "../uploads/cleanup";
import { CustomerPhoto, CustomerPhotoDoc, PHOTO_REJECT_REASON_MAX, PhotoStatus, removePhotoFile } from "./model";

/** "Ana Torres" -> "Ana T."; un solo nombre, tal cual. Lo que se publica bajo la foto. */
export function authorLabel(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.find((w) => /\p{L}/u.test(w));
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/** Clientes, pedidos, personal e imagen actual de los productos de una lista de fotos, con una consulta por coleccion. */
async function loadRefs(photos: CustomerPhotoDoc[]) {
  const ids = (key: "customerId" | "orderId" | "reviewedByStaffId" | "menuItemId") => [
    ...new Set(photos.map((p) => p[key]?.toString()).filter((x): x is string => !!x)),
  ];
  const [users, orders, staff, items] = await Promise.all([
    User.find({ _id: { $in: ids("customerId") } }).select("name customerCode deletedAt").lean(),
    Order.find({ _id: { $in: ids("orderId") } }).select("code").lean(),
    StaffUser.find({ _id: { $in: ids("reviewedByStaffId") } }).select("name").lean(),
    MenuItem.find({ _id: { $in: ids("menuItemId") } }).select("imageUrl").lean(),
  ]);
  return {
    user: new Map(users.map((u) => [u._id.toString(), u])),
    orderCode: new Map(orders.map((o) => [o._id.toString(), o.code])),
    staffName: new Map(staff.map((s) => [s._id.toString(), s.name])),
    itemImage: new Map(items.map((i) => [i._id.toString(), i.imageUrl ?? null])),
  };
}

function toStaffPhoto(p: CustomerPhotoDoc, refs: Awaited<ReturnType<typeof loadRefs>>) {
  const user = refs.user.get(p.customerId.toString());
  return {
    id: p._id.toString(),
    url: p.url ?? null,
    menuItemId: p.menuItemId.toString(),
    menuItemName: p.menuItemName,
    orderCode: refs.orderCode.get(p.orderId.toString()) ?? null,
    customerName: user?.name ?? "Cliente",
    customerCode: user?.customerCode ?? null,
    status: p.status,
    rejectReason: p.rejectReason ?? null,
    stampAwarded: !!p.stampAwarded,
    // Es la principal solo si el producto sigue teniendo su copia (gana el ultimo cambio de imagen).
    usedAsMain: !!p.mainCopyUrl && refs.itemImage.get(p.menuItemId.toString()) === p.mainCopyUrl,
    reviewedByName: p.reviewedByStaffId ? refs.staffName.get(p.reviewedByStaffId.toString()) ?? null : null,
    reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toISOString() : null,
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

const id = (value: string) => {
  if (!Types.ObjectId.isValid(value)) throw new Error("Identificador no valido");
  return new Types.ObjectId(value);
};

export const photosResolvers = {
  Query: {
    productPhotos: async (_: unknown, args: { menuItemId: string; limit?: number | null }) => {
      const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);
      const photos = await CustomerPhoto.find({ menuItemId: id(args.menuItemId), status: "APROBADA" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      const refs = await loadRefs(photos);
      return photos.map((p) => {
        const user = refs.user.get(p.customerId.toString());
        return {
          id: p._id.toString(),
          url: p.url,
          // Cuenta suprimida: la foto sigue publicada (lo autorizo), pero ya sin su nombre.
          authorLabel: user && !user.deletedAt ? authorLabel(user.name) : null,
          createdAt: new Date(p.createdAt).toISOString(),
        };
      });
    },

    myProductPhotos: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const photos = await CustomerPhoto.find({ customerId }).sort({ createdAt: -1 }).limit(100).lean();
      const refs = await loadRefs(photos);
      return photos.map((p) => ({
        id: p._id.toString(),
        url: p.url ?? null,
        menuItemName: p.menuItemName,
        orderCode: refs.orderCode.get(p.orderId.toString()) ?? null,
        status: p.status,
        rejectReason: p.rejectReason ?? null,
        createdAt: new Date(p.createdAt).toISOString(),
      }));
    },

    productPhotosForReview: async (
      _: unknown,
      args: { status: PhotoStatus; limit?: number | null; offset?: number | null },
      ctx: GraphQLContext
    ) => {
      requireStaff(ctx, ["gestion"]);
      const limit = Math.min(Math.max(args.limit ?? 24, 1), 60);
      const offset = Math.max(args.offset ?? 0, 0);
      const filter = { status: args.status };
      // Pendientes en orden de llegada (la cola de moderacion); el resto, lo ultimo primero.
      const [total, photos] = await Promise.all([
        CustomerPhoto.countDocuments(filter),
        CustomerPhoto.find(filter)
          .sort({ createdAt: args.status === "PENDIENTE" ? 1 : -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
      ]);
      const refs = await loadRefs(photos);
      return { total, items: photos.map((p) => toStaffPhoto(p, refs)) };
    },

    pendingProductPhotosCount: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireStaff(ctx, ["gestion"]);
      return CustomerPhoto.countDocuments({ status: "PENDIENTE" });
    },
  },

  Mutation: {
    withdrawProductPhoto: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const customerId = requireCustomer(ctx);
      const photo = await CustomerPhoto.findOneAndDelete({ _id: id(args.id), customerId });
      if (!photo) throw new Error("Foto no encontrada");
      // Si se uso como foto principal, la del producto es una copia y se queda (ver setAsMain).
      await removePhotoFile(photo.url, UPLOAD_DIR);
      return true;
    },

    moderateProductPhoto: async (
      _: unknown,
      args: { id: string; approve: boolean; reason?: string | null; setAsMain?: boolean | null },
      ctx: GraphQLContext
    ) => {
      const staff = requireStaff(ctx, ["gestion"]);
      const photo = await CustomerPhoto.findById(id(args.id));
      if (!photo) throw new Error("Foto no encontrada");
      const now = new Date();

      if (!args.approve) {
        if (photo.status === "RECHAZADA") throw new Error("La foto ya estaba rechazada");
        const reason = args.reason?.trim().slice(0, PHOTO_REJECT_REASON_MAX) || undefined;
        const url = photo.url;
        photo.set({ status: "RECHAZADA", rejectReason: reason, url: undefined, reviewedByStaffId: staff.id, reviewedAt: now });
        await photo.save();
        // El sello, si ya se dio, se queda: se gano al aprobarla.
        await removePhotoFile(url, UPLOAD_DIR);
      } else {
        if (photo.status === "RECHAZADA" || !photo.url) throw new Error("Una foto rechazada ya no se puede aprobar");
        const wasPending = photo.status === "PENDIENTE";
        photo.set({ status: "APROBADA", rejectReason: undefined, reviewedByStaffId: staff.id, reviewedAt: now });

        // Un sello por producto y pedido, aunque el cliente mandara varias fotos de ese producto.
        if (wasPending) {
          const alreadyAwarded = await CustomerPhoto.exists({
            customerId: photo.customerId,
            orderId: photo.orderId,
            menuItemId: photo.menuItemId,
            stampAwarded: true,
          });
          if (!alreadyAwarded) {
            await awardPhotoStamp(photo.customerId.toString(), photo.orderId.toString(), photo.menuItemName, staff.id);
            photo.stampAwarded = true;
          }
        }

        // Foto principal: una copia en /uploads/ (como las que sube gestion en Carta), para que
        // retirar o rechazar la foto del cliente no deje la carta sin imagen. Reemplaza la que
        // hubiera (la ultima en cambiarse es la que vale) y borra su archivo si nadie mas lo usa.
        if (args.setAsMain) {
          const ext = path.extname(photo.url);
          const copyUrl = `/uploads/${crypto.randomUUID()}${ext}`;
          await fs.copyFile(path.join(UPLOAD_DIR, "photos", path.basename(photo.url)), path.join(UPLOAD_DIR, path.basename(copyUrl)));
          const previous = await MenuItem.findOneAndUpdate({ _id: photo.menuItemId }, { $set: { imageUrl: copyUrl } }).select("imageUrl").lean();
          if (!previous) {
            await fs.unlink(path.join(UPLOAD_DIR, path.basename(copyUrl))).catch(() => {});
            throw new Error("El producto ya no existe en la carta");
          }
          photo.mainCopyUrl = copyUrl;
          await removeImageIfUnused(previous.imageUrl);
        }
        await photo.save();
      }

      const refs = await loadRefs([photo.toObject()]);
      return toStaffPhoto(photo.toObject(), refs);
    },
  },
};
