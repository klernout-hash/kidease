#!/usr/bin/env node
/**
 * Write android/app/src/huawei/agconnect-services.json from AGCONNECT_SERVICES_JSON.
 * The secret is base64 of the AppGallery Connect file (raw JSON is also accepted).
 * The file is gitignored. This script never prints the file or the secret.
 *
 *   AGCONNECT_SERVICES_JSON=… node scripts/inject-agconnect-services.mjs
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEST = join(dirname(fileURLToPath(import.meta.url)), "..", "android/app/src/huawei/agconnect-services.json");

export function decodeAgconnectSecret(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const text = value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AGCONNECT_SERVICES_JSON is not valid JSON after decode. The file was not written.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AGCONNECT_SERVICES_JSON must be a JSON object. The file was not written.");
  }
  const pkg = parsed.client?.package_name || parsed.app_info?.package_name;
  if (pkg && pkg !== "ca.kidease.app") {
    throw new Error("agconnect-services.json package_name must be ca.kidease.app. The file was not written.");
  }
  if (!parsed.client && !parsed.app_info) {
    throw new Error("agconnect-services.json is missing client info. The file was not written.");
  }
  return text.endsWith("\n") ? text : `${text}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.AGCONNECT_SERVICES_JSON;
  if (!raw || !String(raw).trim()) {
    console.log("AGCONNECT_SERVICES_JSON is not set. Huawei push compiles without an AppGallery app id.");
    process.exit(0);
  }
  const body = decodeAgconnectSecret(raw);
  mkdirSync(dirname(DEST), { recursive: true });
  writeFileSync(DEST, body, { mode: 0o600 });
  chmodSync(DEST, 0o600);
  console.log(`Wrote agconnect-services.json (${Buffer.byteLength(body)} bytes). Contents not printed.`);
}
