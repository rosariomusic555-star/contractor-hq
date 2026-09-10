/**
 * Client-side image compression before upload — contractors upload
 * full-resolution phone photos straight from the camera roll, and we don't
 * want to blow through Storage or slow pages down. No image library: the
 * canvas re-encode below is plenty for "cap the long edge and re-compress
 * as JPEG," and it's the one thing every browser already ships.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImageFile(
  file: File,
  { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  // Fall back to the original file if canvas encoding fails for any reason
  // (e.g. an exotic HEIC the browser can decode but not re-encode) — an
  // uncompressed upload beats a broken one.
  return blob ?? file;
}

/** Random, collision-proof filename for a Storage object — keeps the
 * extension so content-type sniffing / previews behave, but never trusts
 * the original filename (spaces, unicode, path-like names). */
export function randomImageFilename(originalName: string): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop() : null;
  const safe = ext && /^[a-zA-Z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : "jpg";
  return `${crypto.randomUUID()}.${safe}`;
}
