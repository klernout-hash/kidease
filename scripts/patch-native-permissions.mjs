/**
 * Idempotent permission-string patch for generated Capacitor ios/ + android/.
 * When-in-use location only. Never adds background / always-on location.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CAP_APP_ID,
  CAP_ASSOCIATED_HOSTS,
  CAP_CUSTOM_URL_SCHEMES,
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

function appLinksHttpsFilter() {
  const hosts = CAP_ASSOCIATED_HOSTS.map(
    (host) => `                <data android:scheme="https" android:host="${host}" />`,
  ).join("\n");
  return `            <!-- KidEase App Links (www + apex). Fingerprints stay empty until Play App Signing. -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
${hosts}
            </intent-filter>`;
}

function customSchemeFilter() {
  const schemes = CAP_CUSTOM_URL_SCHEMES.map(
    (scheme) => `                <data android:scheme="${scheme}" />`,
  ).join("\n");
  return `            <!-- Custom schemes. KidEase:// matches iOS; ${CAP_APP_ID}:// is the Capacitor appId. -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
${schemes}
            </intent-filter>`;
}

export function ensureAndroidAppLinks(manifest) {
  let next = manifest;
  if (!next.includes('android:autoVerify="true"')) {
    next = next.replace(
      /<\/intent-filter>\s*<\/activity>/,
      `</intent-filter>\n\n${appLinksHttpsFilter()}\n\n        </activity>`,
    );
  }
  const missingScheme = CAP_CUSTOM_URL_SCHEMES.some(
    (scheme) => !next.includes(`android:scheme="${scheme}"`),
  );
  if (missingScheme) {
    next = next.replace(
      /android:autoVerify="true">[\s\S]*?<\/intent-filter>/,
      (block) => `${block}\n\n${customSchemeFilter()}`,
    );
  }
  return next;
}

function associatedDomainsEntitlementsXml() {
  const domains = CAP_ASSOCIATED_HOSTS.flatMap((host) => [
    `\t\t<string>applinks:${host}</string>`,
    `\t\t<string>webcredentials:${host}</string>`,
  ]).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
${domains}
	</array>
</dict>
</plist>
`;
}

async function writeIosAssociatedDomainsEntitlements() {
  const entitlements = join(root, "ios/App/App/App.entitlements");
  await writeFile(entitlements, associatedDomainsEntitlementsXml());
  console.log("[native-permissions] wrote ios App.entitlements (Associated Domains)");
}

async function ensurePbxEntitlements() {
  const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
  if (!(await pathExists(pbxPath))) return;
  let pbx = await readFile(pbxPath, "utf8");
  if (!pbx.includes("CODE_SIGN_ENTITLEMENTS")) {
    pbx = pbx.replaceAll(
      "INFOPLIST_FILE = App/Info.plist;",
      "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;",
    );
    await writeFile(pbxPath, pbx);
    console.log("[native-permissions] set CODE_SIGN_ENTITLEMENTS in project.pbxproj");
  }
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
      const schemes = CAP_CUSTOM_URL_SCHEMES.map((scheme) => `\t\t\t\t<string>${scheme}</string>`).join(
        "\n",
      );
      plist = plist.replace(
        "</dict>\n</plist>",
        `\t<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>${CAP_APP_ID}</string>
			<key>CFBundleURLSchemes</key>
			<array>
${schemes}
			</array>
		</dict>
	</array>
</dict>
</plist>`,
      );
    } else {
      for (const scheme of CAP_CUSTOM_URL_SCHEMES) {
        if (!plist.includes(`<string>${scheme}</string>`)) {
          plist = plist.replace(
            /<key>CFBundleURLSchemes<\/key>\s*<array>/,
            `<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>`,
          );
        }
      }
    }
    // Plugin binaries may mention always-on APIs; do not request background location.
    plist = stripPlistKey(plist, "NSLocationAlwaysUsageDescription");
    plist = stripPlistKey(plist, "NSLocationAlwaysAndWhenInUseUsageDescription");
    plist = plist.replace(
      /\s*<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>location<\/string>[\s\S]*?<\/array>/,
      "",
    );
    plist = plist.replace(/\s*<string>location<\/string>/g, "");
    if (!plist.includes("<string>remote-notification</string>")) {
      if (plist.includes("<key>UIBackgroundModes</key>")) {
        plist = plist.replace(
          /<key>UIBackgroundModes<\/key>\s*<array>/,
          "<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>",
        );
      } else {
        plist = plist.replace(
          "</dict>\n</plist>",
          `\t<key>UIBackgroundModes</key>
	<array>
		<string>remote-notification</string>
	</array>
</dict>
</plist>`,
        );
      }
    }
    await writeFile(infoPlist, plist);
    console.log("[native-permissions] patched ios Info.plist");

    await writeIosAssociatedDomainsEntitlements();
    await ensurePbxEntitlements();

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
    manifest = ensureAndroidPermission(manifest, "android.permission.POST_NOTIFICATIONS");
    manifest = stripAndroidPermission(manifest, "android.permission.ACCESS_BACKGROUND_LOCATION");
    manifest = ensureAndroidAppLinks(manifest);
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
