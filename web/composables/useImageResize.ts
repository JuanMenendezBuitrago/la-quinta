/**
 * Reescala una foto en el navegador antes de subirla: lado mayor como mucho `maxSide` y JPEG.
 * Al redibujarla se pierden los metadatos EXIF (ubicacion GPS, modelo del movil...), que no deben
 * llegar al servidor. La usan los recibos de gastos y las fotos de clientes.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  // imageOrientation: respeta la rotacion que indica el EXIF antes de descartarlo
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return blob;
}
