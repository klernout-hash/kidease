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
import { join } from "node:path";

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
const HMS = ["Lcom/huawei/hms/", "Lcom/huawei/agconnect/", "com.huawei.hms.client.appid"];

export const FORBIDDEN = {
  play: [...AMAZON, ...HMS],
  samsung: [...AMAZON, ...HMS],
  huawei: [...AMAZON, ...GMS],
  amazon: [...HMS, ...GMS],
};

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
    if (flavor === "amazon") {
      const all = buffers.map((b) => b.buf.toString("latin1") + b.buf.toString("utf16le")).join("");
      if (!all.includes("AmazonAdmPlugin")) {
        failed = true;
        console.error("FAIL amazon: AmazonAdmPlugin missing from the Amazon build");
      }
    }
    if (flavor === "huawei") {
      const all = buffers.map((b) => b.buf.toString("latin1") + b.buf.toString("utf16le")).join("");
      if (!all.includes("KidEaseHmsMessageService")) {
        failed = true;
        console.error("FAIL huawei: KidEaseHmsMessageService missing from the Huawei build");
      }
      if (!all.includes("Lcom/huawei/hms/")) {
        failed = true;
        console.error("FAIL huawei: HMS Push Kit missing from the Huawei build");
      }
    }
  }
  for (const f of Object.keys(FORBIDDEN)) {
    if (!seen.has(f)) {
      failed = true;
      console.error(`FAIL ${f}: no APK built`);
    }
  }
  process.exit(failed ? 1 : 0);
}
