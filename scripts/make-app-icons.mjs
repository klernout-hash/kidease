/**
 * Build square app icons from public/logo-transparent.png.
 * Uses the attached pin as the only artwork: uniform scale, no stretch,
 * no restyle, no rounded corners / shadows / text.
 * Pin height = 78% of the canvas. ~11% padding top and bottom.
 * Extra empty space on the left and right is required.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public/logo-transparent.png");
const iconsDir = join(root, "public/icons");

const SIZES = [180, 192, 512, 1024];

async function compose(size, dest) {
  const trimmedMeta = await sharp(srcPath).trim().metadata();
  const srcW = trimmedMeta.width ?? 657;
  const srcH = trimmedMeta.height ?? 877;
  const pinH = Math.round(size * 0.78);
  const pinW = Math.round(pinH * (srcW / srcH));
  const left = Math.floor((size - pinW) / 2);
  const top = Math.floor((size - pinH) / 2);

  const pin = await sharp(srcPath)
    .trim()
    .resize(pinW, pinH, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: pin, left, top }])
    .png()
    .toFile(dest);

  return { size, pinW, pinH, left, top, dest };
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  for (const size of SIZES) {
    const dest = join(iconsDir, `icon-${size}.png`);
    const info = await compose(size, dest);
    console.log(
      `[app-icons] ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}% side=${((info.left / size) * 100).toFixed(1)}%`,
    );
    if (size === 512) {
      await compose(size, join(root, "public/icon-512.png"));
      await compose(size, join(iconsDir, "icon-maskable-512.png"));
    }
    if (size === 1024) {
      await compose(size, join(iconsDir, "icon-maskable-1024.png"));
    }
  }
}

main().catch((err) => {
  console.error("[app-icons] failed", err);
  process.exit(1);
});
