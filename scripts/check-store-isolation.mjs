#!/usr/bin/env node
/**
 * Store isolation scan. Run after `./gradlew assemble{Play,Samsung,Huawei,Amazon}Debug`.
 * Unzips each APK and scans classes*.dex + AndroidManifest.xml (binary XML, UTF-16 strings)
 * for SDKs that must not ship in that store's build. Exit 1 on any hit.
 *
 *   node scripts/check-store-isolation.mjs android/app/build/outputs/apk
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Class needles are dex type descriptors (Lpkg/Name;), so a reflection *string* such as
// PlayServicesStatus's "com.google.android.gms..." probe is not a false hit. Dotted needles
// are manifest / permission strings.
const AMAZON = [
  "Lcom/amazon/device/messaging/",
  "Lcom/amazon/identity/auth/",
  "Lca/kidease/app/AmazonAdmPlugin;",
  "com.amazon.device.messaging.permission.RECEIVE",
  "RECEIVE_ADM_MESSAGE",
  "KidEaseAdm",
];
const GMS = ["Lcom/google/android/gms/", "Lcom/google/firebase/messaging/", "com.google.android.c2dm.permission.RECEIVE"];
const HMS = [
  "Lcom/huawei/hms/",
  "Lcom/huawei/agconnect/",
  "Lcom/huawei/android/hms/",
  "com.huawei.hms.client.appid",
  "Lca/kidease/app/KidEaseHmsMessageService;",
  "Lca/kidease/app/HuaweiPushPlugin;",
  "KidEaseHms",
];

/** iOS and Microsoft are not Android flavours. CI still scans their sources. */
export const SOURCE_STORES = {
  ios: ["ios"],
  microsoft: ["public/manifest.microsoft.webmanifest"],
};

const SOURCE_NEEDLES = [
  "com.huawei.hms",
  "com.huawei.agconnect",
  "com.amazon.device.messaging",
  "KidEaseHmsMessageService",
  "HuaweiPushPlugin",
  "google-services.json",
];

const SOURCE_SKIP = new Set(["node_modules", "Pods", "build", "DerivedData", ".gradle"]);
const SOURCE_EXT = new Set([
  ".swift",
  ".m",
  ".h",
  ".plist",
  ".json",
  ".xml",
  ".gradle",
  ".pbxproj",
  ".webmanifest",
  ".kt",
  ".java",
  ".entitlements",
  ".xcconfig",
  ".storyboard",
]);

export const FORBIDDEN = {
  play: [...AMAZON, ...HMS],
  samsung: [...AMAZON, ...HMS],
  huawei: [...AMAZON, ...GMS],
  amazon: [...HMS, ...GMS],
};

function walkFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SOURCE_SKIP.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else if (entry.isFile() && SOURCE_EXT.has(extname(entry.name))) out.push(p);
  }
}

export function scanRepoSources(repoRoot) {
  const hits = [];
  for (const [store, rels] of Object.entries(SOURCE_STORES)) {
    for (const rel of rels) {
      const start = join(repoRoot, rel);
      if (!existsSync(start)) {
        hits.push(`${store}: missing ${rel}`);
        continue;
      }
      const files = [];
      if (statSync(start).isDirectory()) walkFiles(start, files);
      else files.push(start);
      for (const file of files) {
        let text = "";
        try {
          text = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        for (const needle of SOURCE_NEEDLES) {
          if (text.includes(needle)) hits.push(`${store}: ${file}: ${needle}`);
        }
      }
    }
  }
  return hits;
}

export function scanBuffers(flavor, buffers) {
  const needles = FORBIDDEN[flavor] || [];
  const hits = [];
  for (const { name, buf } of buffers) {
    const latin = buf.toString("latin1");
    const utf16 = buf.toString("utf16le");
    for (const needle of needles) {
      if (latin.includes(needle) || utf16.includes(needle)) hits.push(`${name}: ${needle}`);
    }
  }
  return hits;
}

function apksUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...apksUnder(p));
    else if (p.endsWith(".apk")) out.push(p);
  }
  return out;
}

function flavorOf(apk) {
  const m = /app-(play|samsung|huawei|amazon)-/.exec(apk);
  return m ? m[1] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceHits = scanRepoSources(repoRoot);
  if (sourceHits.length) {
    console.error(`FAIL source scan:\n  ${sourceHits.join("\n  ")}`);
  } else {
    for (const store of Object.keys(SOURCE_STORES)) console.log(`ok   ${store}: no forbidden store SDKs in source`);
  }
  const root = process.argv[2] || "android/app/build/outputs/apk";
  if (!existsSync(root)) {
    console.error(`No APK folder at ${root}`);
    process.exit(1);
  }
  const apks = apksUnder(root);
  const seen = new Set();
  let failed = false;
  for (const apk of apks) {
    const flavor = flavorOf(apk);
    if (!flavor) continue;
    seen.add(flavor);
    const dir = mkdtempSync(join(tmpdir(), `iso-${flavor}-`));
    execFileSync("unzip", ["-qq", "-o", apk, "classes*.dex", "AndroidManifest.xml", "-d", dir]);
    const buffers = readdirSync(dir).map((name) => ({ name, buf: readFileSync(join(dir, name)) }));
    const hits = scanBuffers(flavor, buffers);
    if (hits.length) {
      failed = true;
      console.error(`FAIL ${flavor} (${apk}):\n  ${hits.join("\n  ")}`);
    } else {
      console.log(`ok   ${flavor}: no forbidden SDKs`);
    }
    const all = buffers.map((b) => b.buf.toString("latin1") + b.buf.toString("utf16le")).join("");
    if (flavor === "amazon" && !all.includes("AmazonAdmPlugin")) {
      failed = true;
      console.error("FAIL amazon: AmazonAdmPlugin missing from the Amazon build");
    }
    if (flavor === "huawei" && !all.includes("KidEaseHmsMessageService")) {
      failed = true;
      console.error("FAIL huawei: KidEaseHmsMessageService missing from the Huawei build");
    }
  }
  for (const f of Object.keys(FORBIDDEN)) {
    if (!seen.has(f)) {
      failed = true;
      console.error(`FAIL ${f}: no APK built`);
    }
  }
  if (sourceHits.length) failed = true;
  process.exit(failed ? 1 : 0);
}
