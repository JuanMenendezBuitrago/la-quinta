import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIR } from "./router";
import { MenuItem } from "../menu/model";
import { Coffee } from "../coffee/model";
import { HeroSlide } from "../hero/model";

// Imagenes subidas por gestion (POST /uploads/): directamente en /uploads/, sin subcarpeta.
const IMAGE_UPLOAD_PATTERN = /^\/uploads\/[\w.-]+$/;

/**
 * Borra una imagen de /uploads/ que se acaba de reemplazar o quitar, si ya no la usa nadie: la
 * carta, los cafes y la portada comparten esa carpeta, y un producto duplicado comparte la suya.
 * Las URL externas y las de subcarpetas (avatares, fotos de clientes, recibos) no se tocan.
 */
export async function removeImageIfUnused(url: string | null | undefined) {
  if (!url || !IMAGE_UPLOAD_PATTERN.test(url)) return;
  const [menu, coffee, hero] = await Promise.all([
    MenuItem.exists({ imageUrl: url }),
    Coffee.exists({ imageUrl: url }),
    HeroSlide.exists({ imageUrl: url }),
  ]);
  if (menu || coffee || hero) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
  } catch {
    // ya no existia
  }
}
