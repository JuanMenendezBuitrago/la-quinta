import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../users/auth";

export const UPLOAD_DIR = path.join(__dirname, "../../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
