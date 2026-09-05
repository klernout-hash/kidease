#!/usr/bin/env node
/**
 * Copy Git listing photos into private R2 `kidease-media`.
 *
 * Default is a dry-run (lists what would upload). Pass --apply to PUT.
 * Does not delete anything under public/photos/.
 *
 * Cloud agents cannot use Production R2_* secrets. Run this on a machine
 * that already has the Vercel Production env (or a local .env you never commit):
 *
 *   npm run media:migrate-r2
 *   npm run media:migrate-r2 -- --apply
 *   npm run media:migrate-r2 -- --apply --prefix photos/buildings
 *
 * See docs/r2-media.md.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentTypeForPhotoKey,
  PUBLIC_PHOTO_KEY_RE,
  publicPhotoToR2Key,
  r2MissingEnv,
  r2StatusFromEnv,
  sanitizeObjectKey,
} from "../src/lib/server/r2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS_DIR = join(root, "public", "photos");
const MIGRATE_MAX_BYTES = 12 * 1024 * 1024;

function parseArgs(argv) {
  const out = {
    apply: false,
    prefix: "",
    limit: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--prefix") {
      out.prefix = String(argv[++i] || "")
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
    } else if (arg === "--limit") {
      out.limit = Math.max(0, Number(argv[++i] || 0) || 0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function walkPhotos(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkPhotos(full, files);
    else files.push(full);
  }
  return files;
}

export function planPhotoMigration(files, { prefix = "" } = {}) {
  const planned = [];
  const skipped = [];
  for (const full of files) {
    const rel = relative(join(root, "public"), full).split("\\").join("/");
    const key = publicPhotoToR2Key(`/${rel}`);
    if (!key || !PUBLIC_PHOTO_KEY_RE.test(key)) {
      skipped.push({ file: rel, reason: "not a listing photo key" });
      continue;
    }
    if (prefix && key !== prefix && !key.startsWith(`${prefix}/`)) continue;
    const bytes = statSync(join(root, "public", rel)).size;
    if (bytes > MIGRATE_MAX_BYTES) {
      skipped.push({ file: rel, reason: `too large (${bytes} bytes)` });
      continue;
    }
    planned.push({
      file: rel,
      key,
      bytes,
      contentType: contentTypeForPhotoKey(key),
    });
  }
  planned.sort((a, b) => a.key.localeCompare(b.key));
  return { planned, skipped };
}

function printHelp() {
  console.log(`Copy public/photos into R2 bucket kidease-media (keys mirror Git).

Usage:
  npm run media:migrate-r2 -- [options]

Options:
  --apply           Upload (default is dry-run)
  --prefix <key>    Only keys under this prefix (e.g. photos/buildings)
  --limit <n>       Stop after n uploads / would-uploads
  --help            Show this help

Required env (never commit values):
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_ENDPOINT or R2_ACCOUNT_ID
  R2_BUCKET (optional, defaults to kidease-media)

Git files are left in place. Re-running skips objects that already exist.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const files = walkPhotos(PHOTOS_DIR);
  const { planned, skipped } = planPhotoMigration(files, { prefix: args.prefix });
  const work = args.limit ? planned.slice(0, args.limit) : planned;

  console.log(`Found ${files.length} files under public/photos/`);
  console.log(`Planned ${planned.length} object(s)${args.prefix ? ` under ${args.prefix}` : ""}`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} (not listing photos or too large)`);
    for (const row of skipped.slice(0, 12)) {
      console.log(`  skip ${row.file}: ${row.reason}`);
    }
  }

  if (!args.apply) {
    for (const row of work.slice(0, 20)) {
      console.log(`  would put ${row.key} (${row.bytes} bytes, ${row.contentType})`);
    }
    if (work.length > 20) console.log(`  … ${work.length - 20} more`);
    console.log("Dry-run. Re-run with --apply to upload. Git photos are not deleted.");
    return;
  }

  const missing = r2MissingEnv();
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}. See docs/r2-media.md — do not paste secrets into git.`);
    process.exitCode = 1;
    return;
  }

  const status = r2StatusFromEnv();
  console.log(`Uploading to bucket ${status.bucket} at ${status.endpointHost}`);

  const { headR2Object, putR2ObjectBytes } = await import("../src/lib/server/r2.server.ts");
  let uploaded = 0;
  let existed = 0;
  let failed = 0;
  for (const row of work) {
    const key = sanitizeObjectKey(row.key);
    try {
      if (await headR2Object(key)) {
        existed += 1;
        console.log(`  exists ${key}`);
        continue;
      }
      const body = readFileSync(join(root, "public", row.file));
      await putR2ObjectBytes({
        key,
        contentType: row.contentType,
        body,
      });
      uploaded += 1;
      console.log(`  put ${key} (${row.bytes} bytes)`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  fail ${key}: ${message}`);
    }
  }

  console.log(
    `Done. uploaded=${uploaded} already-existed=${existed} failed=${failed}. Git public/photos/ was not deleted.`,
  );
  if (failed) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
