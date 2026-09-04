/**
 * Build square favicons and app icons from public/logo-transparent.png.
 * Exact attached pin only: uniform scale, no stretch, no restyle.
 * Small favicons use a fuller pin so the face stays readable at 16px.
 * Store / PWA tiles keep ~78% height with 11% top/bottom padding.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public/logo-transparent.png");
const iconsDir = join(root, "public/icons");

async function composeBuffer(size, pinRatio) {
  const trimmedMeta = await sharp(srcPath).trim().metadata();
  const srcW = trimmedMeta.width ?? 657;
  const srcH = trimmedMeta.height ?? 877;
  const pinH = Math.round(size * pinRatio);
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

  const buf = await sharp({
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

  return { size, pinW, pinH, left, top, buf };
}

async function composeFile(size, pinRatio, dest) {
  const info = await composeBuffer(size, pinRatio);
  await writeFile(dest, info.buf);
  console.log(
    `[app-icons] ${dest.replace(root + "/", "")} ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}%`,
  );
  return info;
}

function pngsToIco(images) {
  const count = images.length;
  let offset = 6 + 16 * count;
  const entries = images.map(({ size, buf }) => {
    const entry = { size, bytes: buf.length, offset };
    offset += buf.length;
    return entry;
  });
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  let cursor = 6;
  for (const entry of entries) {
    out.writeUInt8(entry.size >= 256 ? 0 : entry.size, cursor);
    out.writeUInt8(entry.size >= 256 ? 0 : entry.size, cursor + 1);
    out.writeUInt8(0, cursor + 2);
    out.writeUInt8(0, cursor + 3);
    out.writeUInt16LE(1, cursor + 4);
    out.writeUInt16LE(32, cursor + 6);
    out.writeUInt32LE(entry.bytes, cursor + 8);
    out.writeUInt32LE(entry.offset, cursor + 12);
    cursor += 16;
  }
  for (const { buf } of images) {
    buf.copy(out, cursor);
    cursor += buf.length;
  }
  return out;
}

async function main() {
  await mkdir(iconsDir, { recursive: true });

  const fav16 = await composeFile(16, 0.88, join(root, "public/favicon-16.png"));
  const fav32 = await composeFile(32, 0.86, join(root, "public/favicon-32.png"));
  const fav48 = await composeFile(48, 0.84, join(root, "public/favicon-48.png"));
  await writeFile(
    join(root, "public/favicon.ico"),
    pngsToIco([
      { size: 16, buf: fav16.buf },
      { size: 32, buf: fav32.buf },
      { size: 48, buf: fav48.buf },
    ]),
  );
  console.log("[app-icons] public/favicon.ico 16+32+48");

  await composeFile(180, 0.78, join(iconsDir, "icon-180.png"));
  await composeFile(180, 0.78, join(root, "public/apple-touch-icon.png"));
  await composeFile(192, 0.78, join(iconsDir, "icon-192.png"));
  await composeFile(512, 0.78, join(iconsDir, "icon-512.png"));
  await composeFile(512, 0.78, join(root, "public/icon-512.png"));
  await composeFile(512, 0.78, join(iconsDir, "icon-maskable-512.png"));
  await composeFile(1024, 0.78, join(iconsDir, "icon-1024.png"));
  await composeFile(1024, 0.78, join(iconsDir, "icon-maskable-1024.png"));
}

main().catch((err) => {
  console.error("[app-icons] failed", err);
  process.exit(1);
});
