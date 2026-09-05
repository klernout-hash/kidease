/**
 * Copy KidEase pin icons + a white splash into Capacitor resources and
 * (when present) the generated ios/ and android/ projects.
 *
 * Source of truth: scripts/make-app-icons.mjs + public/logo-transparent.png.
 * Overwrites Capacitor template placeholders; keeps their filenames.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_FILL, MASKABLE_FILL, composeBuffer } from "./make-app-icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPLASH_SIZE = 2732;
const SPLASH_FILL = 0.42;

const ANDROID_LAUNCHER = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const ANDROID_FOREGROUND = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

const ANDROID_SPLASH = {
  mdpi: 480,
  hdpi: 800,
  xhdpi: 1280,
  xxhdpi: 1920,
  xxxhdpi: 2732,
};

async function pathExists(path) {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writePng(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

export async function syncNativeAssets() {
  const resources = join(root, "resources");
  await mkdir(join(resources, "android"), { recursive: true });

  const icon = await composeBuffer(1024, APP_FILL);
  const splash = await composeBuffer(SPLASH_SIZE, SPLASH_FILL);
  const foreground = await composeBuffer(1024, MASKABLE_FILL, {
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    flatten: false,
  });

  await writePng(join(resources, "icon.png"), icon.png);
  await writePng(join(resources, "splash.png"), splash.png);
  await writePng(join(resources, "android", "icon-foreground.png"), foreground.png);
  console.log("[native-assets] wrote resources/icon.png resources/splash.png");

  const iosIcon = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
  if (await pathExists(dirname(iosIcon))) {
    await writePng(iosIcon, icon.png);
    const splashDir = join(root, "ios/App/App/Assets.xcassets/Splash.imageset");
    await writePng(join(splashDir, "splash-2732x2732.png"), splash.png);
    await writePng(join(splashDir, "splash-2732x2732-1.png"), splash.png);
    await writePng(join(splashDir, "splash-2732x2732-2.png"), splash.png);
    console.log("[native-assets] copied iOS AppIcon + Splash");
  }

  const androidRes = join(root, "android/app/src/main/res");
  if (await pathExists(androidRes)) {
    for (const [density, size] of Object.entries(ANDROID_LAUNCHER)) {
      const tile = await composeBuffer(size, APP_FILL);
      await writePng(join(androidRes, `mipmap-${density}`, "ic_launcher.png"), tile.png);
      await writePng(join(androidRes, `mipmap-${density}`, "ic_launcher_round.png"), tile.png);
    }
    for (const [density, size] of Object.entries(ANDROID_FOREGROUND)) {
      const fg = await composeBuffer(size, MASKABLE_FILL, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        flatten: false,
      });
      await writePng(join(androidRes, `mipmap-${density}`, "ic_launcher_foreground.png"), fg.png);
    }
    for (const [density, size] of Object.entries(ANDROID_SPLASH)) {
      const shot = await composeBuffer(size, SPLASH_FILL);
      await writePng(join(androidRes, `drawable-port-${density}`, "splash.png"), shot.png);
      await writePng(join(androidRes, `drawable-land-${density}`, "splash.png"), shot.png);
    }
    await writePng(join(androidRes, "drawable", "splash.png"), splash.png);
    console.log("[native-assets] copied Android mipmaps + splash");
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  syncNativeAssets().catch((err) => {
    console.error("[native-assets] failed", err);
    process.exit(1);
  });
}
