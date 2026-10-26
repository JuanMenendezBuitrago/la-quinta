import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../users/auth";
import { Types } from "mongoose";
import { StaffUser, User } from "../users/model";
import { AVATAR_UPLOAD_PREFIX, removeAvatarFile } from "../users/avatar";
import { RECEIPT_UPLOAD_PREFIX } from "../expenses/model";
import { Order } from "../orders/model";
import {
  CustomerPhoto,
  MAX_PENDING_PHOTOS,
  PHOTO_CONSENT_VERSION,
  PHOTO_ORDER_MAX_AGE_DAYS,
  PHOTO_UPLOAD_PREFIX,
  PHOTOS_PER_ORDER_ITEM,
  removePhotoFile,
} from "../photos/model";

export const UPLOAD_DIR = path.join(__dirname, "../../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const RECEIPT_DIR = path.join(UPLOAD_DIR, "receipts");
fs.mkdirSync(RECEIPT_DIR, { recursive: true });
const PHOTO_DIR = path.join(UPLOAD_DIR, "photos");
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_EXTENSIONS[file.mimetype] ?? path.extname(file.originalname) ?? "";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Formato de imagen no soportado (usa JPG, PNG, WEBP o GIF)"));
      return;
    }
    cb(null, true);
  },
});

export const uploadsRouter = Router();

/** Solo personal con rol "gestion" puede subir imagenes (misma regla que editar la carta). */
uploadsRouter.post("/", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload || payload.kind !== "staff" || payload.role !== "gestion") {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "No se pudo subir el archivo";
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se envio ningun archivo" });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

/**
 * Avatares: la web ya los recorta a un cuadrado pequeño y los vuelve a codificar en el navegador
 * (lo que ademas quita los metadatos EXIF, como la ubicacion de la foto), asi que aqui el limite
 * es bajo. Sin GIF: un avatar animado no aporta y pesa.
 */
const AVATAR_MAX_FILE_SIZE = 1024 * 1024;
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${AVATAR_MIME_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: AVATAR_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Formato de imagen no soportado (usa JPG, PNG o WEBP)"));
      return;
    }
    cb(null, true);
  },
});

/**
 * Cualquier cliente o miembro del personal con sesion sube su propia foto de avatar. La guarda
 * directamente en su cuenta (y borra la anterior): asi nadie puede apuntar su avatar a la foto
 * de otro, cosa que pasaria si la ruta se mandara despues por GraphQL. Gestion puede ademas
 * subirla para otro miembro del personal con ?staffId=<id>.
 */
uploadsRouter.post("/avatar", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  const targetStaffId = typeof req.query.staffId === "string" ? req.query.staffId : null;
  if (targetStaffId && (payload.kind !== "staff" || payload.role !== "gestion" || !Types.ObjectId.isValid(targetStaffId))) {
    res.status(403).json({ error: "Solo gestion puede cambiar el avatar de otra persona" });
    return;
  }

  avatarUpload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      const message = tooBig
        ? "La imagen es demasiado grande (maximo 1 MB)"
        : err instanceof Error
          ? err.message
          : "No se pudo subir el archivo";
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se envio ningun archivo" });
      return;
    }

    const avatar = `${AVATAR_UPLOAD_PREFIX}${req.file.filename}`;
    try {
      // Devuelve el documento anterior: hace falta su avatar para borrar la foto vieja.
      const previous =
        payload.kind === "staff"
          ? // En una cuenta compartida, "mi avatar" es el de la persona que la esta usando
            await StaffUser.findByIdAndUpdate(targetStaffId ?? payload.actor ?? payload.sub, { avatar }).lean()
          : await User.findOneAndUpdate({ _id: payload.sub, deletedAt: { $exists: false } }, { avatar }).lean();
      if (!previous) {
        await removeAvatarFile(avatar, UPLOAD_DIR);
        res.status(401).json({ error: "No autorizado" });
        return;
      }
      await removeAvatarFile(previous.avatar, UPLOAD_DIR);
      res.json({ avatar });
    } catch {
      await removeAvatarFile(avatar, UPLOAD_DIR);
      res.status(500).json({ error: "No se pudo guardar el avatar" });
    }
  });
});

/**
 * Foto del recibo de un gasto: cualquier miembro del personal (barra tambien registra gastos).
 * La web ya la reescala y la vuelve a codificar (quita los EXIF); aqui solo se limita tipo y tamaño.
 * Devuelve la ruta, que createExpense/updateExpense guardan en el gasto.
 */
const RECEIPT_MAX_FILE_SIZE = 2 * 1024 * 1024;
const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECEIPT_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${AVATAR_MIME_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: RECEIPT_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Formato de imagen no soportado (usa JPG, PNG o WEBP)"));
      return;
    }
    cb(null, true);
  },
});

uploadsRouter.post("/receipt", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.kind !== "staff") {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  receiptUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      res.status(400).json({ error: tooBig ? "La foto es demasiado grande (maximo 2 MB)" : err instanceof Error ? err.message : "No se pudo subir la foto" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se envio ningun archivo" });
      return;
    }
    res.json({ url: `${RECEIPT_UPLOAD_PREFIX}${req.file.filename}` });
  });
});

/**
 * Foto de un cliente de un producto de su pedido (ver modules/photos). Como /avatar, el propio
 * endpoint crea el registro (pendiente de moderar): asi nadie puede asociar a un pedido el
 * archivo de otro. La web ya la reescala a 1600 px y la vuelve a codificar, lo que quita el EXIF
 * (ubicacion GPS...). Campos: orderId, menuItemId y consent=true (autoriza publicarla).
 */
const PHOTO_MAX_FILE_SIZE = 2 * 1024 * 1024;
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PHOTO_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${AVATAR_MIME_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: PHOTO_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Formato de imagen no soportado (usa JPG, PNG o WEBP)"));
      return;
    }
    cb(null, true);
  },
});

/** Por que no se puede enviar esa foto (o null): pedido suyo, entregado y reciente, con ese producto. */
async function photoProblem(customerId: string, orderId: unknown, menuItemId: unknown, consent: unknown) {
  if (consent !== "true") return "Para enviar la foto tienes que autorizar que la publiquemos";
  if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) return "Pedido no valido";
  if (typeof menuItemId !== "string" || !Types.ObjectId.isValid(menuItemId)) return "Producto no valido";
  const order = await Order.findOne({ _id: orderId, customerId }).select("status deliveredAt updatedAt items").lean();
  if (!order) return "Pedido no encontrado";
  if (order.status !== "ENTREGADO") return "Solo se pueden enviar fotos de pedidos entregados";
  const deliveredAt = order.deliveredAt ?? order.updatedAt;
  if (Date.now() - new Date(deliveredAt).getTime() > PHOTO_ORDER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    return `Solo se pueden enviar fotos de pedidos de los ultimos ${PHOTO_ORDER_MAX_AGE_DAYS} dias`;
  }
  const line = order.items.find((i) => i.menuItemId.toString() === menuItemId);
  if (!line) return "Ese producto no estaba en el pedido";
  const [sameItem, pending] = await Promise.all([
    CustomerPhoto.countDocuments({ customerId, orderId, menuItemId }),
    CustomerPhoto.countDocuments({ customerId, status: "PENDIENTE" }),
  ]);
  if (sameItem >= PHOTOS_PER_ORDER_ITEM) return `Ya enviaste ${PHOTOS_PER_ORDER_ITEM} fotos de este producto en este pedido`;
  if (pending >= MAX_PENDING_PHOTOS) return `Tienes ${MAX_PENDING_PHOTOS} fotos pendientes de revisar: espera a que las revisemos`;
  return { menuItemName: line.name };
}

uploadsRouter.post("/photo", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.kind !== "customer") {
    res.status(401).json({ error: "Inicia sesion para enviar fotos" });
    return;
  }

  photoUpload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      res.status(400).json({ error: tooBig ? "La foto es demasiado grande (maximo 2 MB)" : err instanceof Error ? err.message : "No se pudo subir la foto" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se envio ningun archivo" });
      return;
    }
    const url = `${PHOTO_UPLOAD_PREFIX}${req.file.filename}`;
    try {
      const active = await User.exists({ _id: payload.sub, deletedAt: { $exists: false } });
      const check = active ? await photoProblem(payload.sub, req.body?.orderId, req.body?.menuItemId, req.body?.consent) : "No autorizado";
      if (typeof check === "string") {
        await removePhotoFile(url, UPLOAD_DIR);
        res.status(active ? 400 : 401).json({ error: check });
        return;
      }
      const photo = await CustomerPhoto.create({
        customerId: payload.sub,
        orderId: req.body.orderId,
        menuItemId: req.body.menuItemId,
        menuItemName: check.menuItemName,
        url,
        consentAt: new Date(),
        consentVersion: PHOTO_CONSENT_VERSION,
      });
      res.json({ id: photo._id.toString(), url, status: photo.status });
    } catch {
      await removePhotoFile(url, UPLOAD_DIR);
      res.status(500).json({ error: "No se pudo guardar la foto" });
    }
  });
});
