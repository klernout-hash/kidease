/**
 * Encode app-controlled marketing stills (cottage / kitchen) as AVIF + WebP
 * at the existing photo width allow-list. Re-run after replacing a source JPEG.
 *
 *   node scripts/encode-feel-photos.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

export const FEEL_ENCODE_STEMS = ["cottage", "kitchen"];
export const FEEL_ENCODE_WIDTHS = [768, 1200];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const photos = join(root, "public/photos");

export async function encodeFeelPhoto(stem, width) {
  const src = join(photos, `${stem}.jpg`);
  const pipeline = () =>
    sharp(src, { failOn: "none" }).rotate().resize({
      width,
      withoutEnlargement: true,
    });

  await Promise.all([
    pipeline().avif({ quality: 45 }).toFile(join(photos, `${stem}-${width}.avif`)),
    pipeline().webp({ quality: 68 }).toFile(join(photos, `${stem}-${width}.webp`)),
    pipeline().jpeg({ quality: 78, mozjpeg: true }).toFile(join(photos, `${stem}-${width}.jpg`)),
  ]);
}

export async function encodeFeelPhotos() {
  await mkdir(photos, { recursive: true });
  for (const stem of FEEL_ENCODE_STEMS) {
    for (const width of FEEL_ENCODE_WIDTHS) {
      await encodeFeelPhoto(stem, width);
    }
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  encodeFeelPhotos().catch((err) => {
    console.error("[feel-photos] failed", err);
    process.exit(1);
  });
}
