import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../users/auth";
import { StaffUser, User } from "../users/model";
import { AVATAR_UPLOAD_PREFIX, removeAvatarFile } from "../users/avatar";

export const UPLOAD_DIR = path.join(__dirname, "../../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

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
 * de otro, cosa que pasaria si la ruta se mandara despues por GraphQL.
 */
uploadsRouter.post("/avatar", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "No autorizado" });
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
          ? await StaffUser.findByIdAndUpdate(payload.sub, { avatar }).lean()
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
