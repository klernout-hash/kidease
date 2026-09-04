/**
 * Build square favicons + app icons from public/logo-transparent.png.
 * Exact pin only: uniform scale, no stretch, no restyle, no rounded corners.
 *
 * Tab / ICO sizes (16, 32, 48): pin height 88% so the face stays readable at 16px.
 * Apple / PWA sizes (180, 192, 512, 1024): pin height 78% with ~11% top/bottom pad.
 * Extra empty space left and right is required.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public/logo-transparent.png");
const iconsDir = join(root, "public/icons");

const TAB_SIZES = [16, 32, 48];
const APP_SIZES = [180, 192, 512, 1024];

async function composeBuffer(size, fill) {
  const trimmedMeta = await sharp(srcPath).trim().metadata();
  const srcW = trimmedMeta.width ?? 657;
  const srcH = trimmedMeta.height ?? 877;
  const pinH = Math.round(size * fill);
  const pinW = Math.round(pinH * (srcW / srcH));
  const left = Math.floor((size - pinW) / 2);
  const top = Math.floor((size - pinH) / 2);

  const pin = await sharp(srcPath)
    .trim()
    .resize(pinW, pinH, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: pin, left, top }])
    .png()
    .toBuffer();

  return { size, pinW, pinH, left, top, png };
}

async function composeFile(size, dest, fill) {
  const info = await composeBuffer(size, fill);
  await writeFile(dest, info.png);
  return { ...info, dest };
}

function pngsToIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const png of pngs) {
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

async function main() {
  await mkdir(iconsDir, { recursive: true });

  const tabPngs = [];
  for (const size of TAB_SIZES) {
    const dest = join(root, `public/favicon-${size}.png`);
    const info = await composeFile(size, dest, 0.88);
    tabPngs.push(info.png);
    console.log(
      `[favicon] ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}%`,
    );
  }
  await writeFile(join(root, "public/favicon.ico"), pngsToIco(tabPngs));
  console.log("[favicon] wrote favicon.ico (16/32/48)");

  for (const size of APP_SIZES) {
    const dest = join(iconsDir, `icon-${size}.png`);
    const info = await composeFile(size, dest, 0.78);
    console.log(
      `[app-icons] ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}% side=${((info.left / size) * 100).toFixed(1)}%`,
    );
    if (size === 180) {
      await writeFile(join(root, "public/apple-touch-icon.png"), info.png);
    }
    if (size === 192) {
      await writeFile(join(root, "public/favicon-192.png"), info.png);
    }
    if (size === 512) {
      await writeFile(join(root, "public/icon-512.png"), info.png);
      await writeFile(join(iconsDir, "icon-maskable-512.png"), info.png);
    }
    if (size === 1024) {
      await writeFile(join(iconsDir, "icon-maskable-1024.png"), info.png);
    }
  }
}

main().catch((err) => {
  console.error("[app-icons] failed", err);
  process.exit(1);
});
