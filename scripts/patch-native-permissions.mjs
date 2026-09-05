/**
 * Idempotent permission-string patch for generated Capacitor ios/ + android/.
 * When-in-use location only. Never adds background / always-on location.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LOCATION_WHEN_IN_USE_EN,
  LOCATION_WHEN_IN_USE_FR,
} from "./native-permissions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function upsertPlistString(plist, key, value) {
  const block = `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>`;
  const re = new RegExp(`\\t<key>${key}</key>\\s*<string>[\\s\\S]*?</string>`);
  if (re.test(plist)) return plist.replace(re, block);
  if (plist.includes(`<key>${key}</key>`)) {
    return plist.replace(
      new RegExp(`<key>${key}</key>\\s*<string>[\\s\\S]*?</string>`),
      `<key>${key}</key>\n\t<string>${escapeXml(value)}</string>`,
    );
  }
  return plist.replace("</dict>\n</plist>", `${block}\n</dict>\n</plist>`);
}

function stripPlistKey(plist, key) {
  return plist.replace(new RegExp(`\\s*<key>${key}</key>\\s*<string>[\\s\\S]*?</string>`), "");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ensureAndroidPermission(manifest, name) {
  if (manifest.includes(`android:name="${name}"`)) return manifest;
  return manifest.replace(
    "<application",
    `    <uses-permission android:name="${name}" />\n\n    <application`,
  );
}

function stripAndroidPermission(manifest, name) {
  return manifest.replace(
    new RegExp(`\\s*<uses-permission[^>]*android:name="${name}"[^>]*/>`, "g"),
    "",
  );
}

function upsertXmlString(xml, name, value) {
  const tag = `<string name="${name}">${escapeXml(value)}</string>`;
  const re = new RegExp(`<string name="${name}">[\\s\\S]*?</string>`);
  if (re.test(xml)) return xml.replace(re, tag);
  return xml.replace("</resources>", `    ${tag}\n</resources>`);
}

export async function patchNativePermissions() {
  const infoPlist = join(root, "ios/App/App/Info.plist");
  if (await pathExists(infoPlist)) {
    let plist = await readFile(infoPlist, "utf8");
    plist = upsertPlistString(plist, "NSLocationWhenInUseUsageDescription", LOCATION_WHEN_IN_USE_EN);
    if (!plist.includes("ITSAppUsesNonExemptEncryption")) {
      plist = plist.replace(
        "</dict>\n</plist>",
        "\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>",
      );
    }
    if (!plist.includes("CFBundleURLTypes")) {
      plist = plist.replace(
        "</dict>\n</plist>",
        `\t<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>ca.daycarenearme.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>KidEase</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`,
      );
    }
    // Plugin binaries may mention always-on APIs; do not request background location.
    plist = stripPlistKey(plist, "NSLocationAlwaysUsageDescription");
    plist = stripPlistKey(plist, "NSLocationAlwaysAndWhenInUseUsageDescription");
    plist = plist.replace(
      /\s*<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>location<\/string>[\s\S]*?<\/array>/,
      "",
    );
    await writeFile(infoPlist, plist);
    console.log("[native-permissions] patched ios Info.plist");

    const enDir = join(root, "ios/App/App/en.lproj");
    const frDir = join(root, "ios/App/App/fr.lproj");
    await mkdir(enDir, { recursive: true });
    await mkdir(frDir, { recursive: true });
    await writeFile(
      join(enDir, "InfoPlist.strings"),
      `"NSLocationWhenInUseUsageDescription" = "${LOCATION_WHEN_IN_USE_EN.replaceAll('"', '\\"')}";\n`,
    );
    await writeFile(
      join(frDir, "InfoPlist.strings"),
      `"NSLocationWhenInUseUsageDescription" = "${LOCATION_WHEN_IN_USE_FR.replaceAll('"', '\\"')}";\n`,
    );
  }

  const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");
  if (await pathExists(manifestPath)) {
    let manifest = await readFile(manifestPath, "utf8");
    manifest = ensureAndroidPermission(manifest, "android.permission.ACCESS_COARSE_LOCATION");
    manifest = ensureAndroidPermission(manifest, "android.permission.ACCESS_FINE_LOCATION");
    manifest = stripAndroidPermission(manifest, "android.permission.ACCESS_BACKGROUND_LOCATION");
    if (!manifest.includes("android.hardware.location.gps")) {
      manifest = manifest.replace(
        "<application",
        `    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n\n    <application`,
      );
    }
    await writeFile(manifestPath, manifest);
    console.log("[native-permissions] patched AndroidManifest.xml");
  }

  const stringsEn = join(root, "android/app/src/main/res/values/strings.xml");
  if (await pathExists(stringsEn)) {
    let xml = await readFile(stringsEn, "utf8");
    xml = upsertXmlString(xml, "location_permission_rationale", LOCATION_WHEN_IN_USE_EN);
    await writeFile(stringsEn, xml);
    const frDir = join(root, "android/app/src/main/res/values-fr");
    await mkdir(frDir, { recursive: true });
    await writeFile(
      join(frDir, "strings.xml"),
      `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">KidEase</string>
    <string name="title_activity_main">KidEase</string>
    <string name="location_permission_rationale">${escapeXml(LOCATION_WHEN_IN_USE_FR)}</string>
</resources>
`,
    );
    console.log("[native-permissions] patched Android strings");
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  patchNativePermissions().catch((err) => {
    console.error("[native-permissions] failed", err);
    process.exit(1);
  });
}
