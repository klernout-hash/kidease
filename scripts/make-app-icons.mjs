/**
 * Build square favicons + app icons from public/logo-transparent.png.
 * Exact pin only: uniform scale, no stretch, no restyle, no rounded corners.
 *
 * Tab / ICO sizes (16, 32, 48): pin height 90% so the face stays readable at 16px.
 * Apple / PWA / store sizes: pin height 94% with a ~3% safe margin so the iOS
 * rounded-rect mask does not clip the pin tip or face.
 * Maskable / adaptive-foreground: pin height 80% (Android safe zone).
 * Home-screen tiles use an opaque white canvas — not a transparent pad.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

export const TAB_FILL = 0.9;
export const APP_FILL = 0.94;
export const MASKABLE_FILL = 0.8;

export const TAB_SIZES = [16, 32, 48];
export const APP_SIZES = [180, 192, 512, 1024];

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public/logo-transparent.png");
const iconsDir = join(root, "public/icons");
const grokDir = join(root, "public/__grok");

let trimmedCache = null;

export async function loadTrimmedPin() {
  if (trimmedCache) return trimmedCache;

  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const buffer = await sharp(srcPath)
    .extract({ left: minX, top: minY, width, height })
    .png()
    .toBuffer();

  trimmedCache = {
    buffer,
    width,
    height,
    srcWidth: info.width,
    srcHeight: info.height,
    trimLeft: minX,
    trimTop: minY,
  };
  return trimmedCache;
}

export async function composeBuffer(size, fill, { background = WHITE, flatten = true } = {}) {
  const src = await loadTrimmedPin();
  const pinH = Math.round(size * fill);
  const pinW = Math.round(pinH * (src.width / src.height));
  if (pinW > size) {
    throw new Error(
      `pin width ${pinW} exceeds canvas ${size}; fill ${fill} is too large for this mark`,
    );
  }
  const left = Math.floor((size - pinW) / 2);
  const top = Math.floor((size - pinH) / 2);

  const pin = await sharp(src.buffer)
    .resize(pinW, pinH, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  let canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  }).composite([{ input: pin, left, top }]);

  if (flatten) {
    canvas = canvas.flatten({ background: WHITE });
  }

  const png = await canvas.png().toBuffer();
  return { size, pinW, pinH, left, top, png };
}

async function composeFile(size, dest, fill, opts) {
  const info = await composeBuffer(size, fill, opts);
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

function svgWrapper(src) {
  const imageH = APP_FILL * 1024 * (src.srcHeight / src.height);
  const imageW = imageH * (src.srcWidth / src.srcHeight);
  const left = (1024 - imageW) / 2;
  const top = (1024 - imageH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="KidEase">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <image href="/logo-transparent.png" x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${imageW.toFixed(2)}" height="${imageH.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

async function writeCopies(bytes, paths) {
  await Promise.all(paths.map((dest) => writeFile(dest, bytes)));
}

export async function main() {
  await mkdir(iconsDir, { recursive: true });
  await mkdir(grokDir, { recursive: true });

  const tabPngs = [];
  for (const size of TAB_SIZES) {
    const dest = join(root, `public/favicon-${size}.png`);
    const info = await composeFile(size, dest, TAB_FILL);
    tabPngs.push(info.png);
    console.log(
      `[favicon] ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}%`,
    );
  }
  await writeFile(join(root, "public/favicon.ico"), pngsToIco(tabPngs));
  console.log("[favicon] wrote favicon.ico (16/32/48)");

  const bySize = new Map();
  for (const size of APP_SIZES) {
    const dest = join(iconsDir, `icon-${size}.png`);
    const info = await composeFile(size, dest, APP_FILL);
    bySize.set(size, info);
    console.log(
      `[app-icons] ${size} pin ${info.pinW}x${info.pinH} padT=${((info.top / size) * 100).toFixed(1)}% side=${((info.left / size) * 100).toFixed(1)}%`,
    );
  }

  const icon180 = bySize.get(180);
  const icon192 = bySize.get(192);
  const icon512 = bySize.get(512);
  const icon1024 = bySize.get(1024);

  await writeCopies(icon180.png, [
    join(root, "public/apple-touch-icon.png"),
    join(root, "public/apple-touch-icon-precomposed.png"),
    join(root, "public/apple-touch-icon-180x180.png"),
    join(root, "public/apple-touch-icon-180x180-precomposed.png"),
    join(grokDir, "icon-180.png"),
  ]);
  await writeCopies(icon192.png, [
    join(root, "public/favicon-192.png"),
    join(root, "public/icon-192.png"),
    join(grokDir, "icon-192.png"),
  ]);
  await writeCopies(icon512.png, [
    join(root, "public/icon-512.png"),
    join(grokDir, "icon-512.png"),
  ]);
  await writeFile(join(root, "public/icon-1024.png"), icon1024.png);
  await writeFile(join(root, "public/store/appstore-icon.png"), icon1024.png);

  const maskable512 = await composeFile(
    512,
    join(iconsDir, "icon-maskable-512.png"),
    MASKABLE_FILL,
  );
  const maskable1024 = await composeFile(
    1024,
    join(iconsDir, "icon-maskable-1024.png"),
    MASKABLE_FILL,
  );
  console.log(
    `[maskable] 512 pin ${maskable512.pinW}x${maskable512.pinH} padT=${((maskable512.top / 512) * 100).toFixed(1)}%`,
  );
  console.log(
    `[maskable] 1024 pin ${maskable1024.pinW}x${maskable1024.pinH} padT=${((maskable1024.top / 1024) * 100).toFixed(1)}%`,
  );

  const foreground = await composeFile(1024, join(iconsDir, "icon-foreground.png"), MASKABLE_FILL, {
    background: CLEAR,
    flatten: false,
  });
  console.log(`[foreground] 1024 pin ${foreground.pinW}x${foreground.pinH} (transparent canvas)`);

  const svg = svgWrapper(await loadTrimmedPin());
  await writeFile(join(root, "public/favicon.svg"), svg);
  await writeFile(join(root, "public/logo.svg"), svg);
  await writeFile(join(root, "public/app-icon.svg"), svg);
  console.log("[svg] wrote favicon.svg logo.svg app-icon.svg at app fill");
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[app-icons] failed", err);
    process.exit(1);
  });
}
