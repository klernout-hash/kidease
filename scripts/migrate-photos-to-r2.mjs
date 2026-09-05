/**
 * Inventory Git listing photos and (optionally) copy them into private R2.
 *
 * Mapping: `/photos/{rel}` → `originals/{rel}`
 * Example: public/photos/wpg/1001.jpg → originals/wpg/1001.jpg
 *
 * Default is dry-run. Upload only with --apply and R2_* env (never commit those).
 * Does not delete Git photos.
 *
 *   node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --inventory
 *   node --experimental-strip-types scripts/migrate-photos-to-r2.mjs
 *   node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --apply
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentTypeForPhotoPath,
  listingSrcToR2Key,
  R2_MAX_OBJECT_BYTES,
  R2_ORIGINALS_PREFIX,
  resolveR2Config,
  r2MissingEnv,
} from "../src/lib/server/r2.ts";

export const PHOTO_ROOT_REL = "public/photos";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function groupForRel(rel) {
  if (!rel.includes("/")) return "root";
  return rel.split("/")[0] || "root";
}

export function parseMigrateArgs(argv) {
  const args = {
    apply: false,
    dryRun: true,
    force: false,
    inventory: false,
    inventoryFull: false,
    help: false,
    limit: 0,
    only: "",
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (token === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (token === "--force") {
      args.force = true;
    } else if (token === "--inventory") {
      args.inventory = true;
    } else if (token === "--inventory-full") {
      args.inventory = true;
      args.inventoryFull = true;
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--limit") {
      args.limit = Math.max(0, Number(argv[i + 1] || 0) || 0);
      i += 1;
    } else if (token === "--only") {
      args.only = String(argv[i + 1] || "")
        .trim()
        .toLowerCase();
      i += 1;
    } else if (token === "--concurrency") {
      args.concurrency = Math.min(16, Math.max(1, Number(argv[i + 1] || 4) || 4));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

export function collectPhotoFiles(workspaceRoot = root) {
  const photosRoot = join(workspaceRoot, PHOTO_ROOT_REL);
  const files = [];
  for (const abs of walkFiles(photosRoot).sort()) {
    const rel = relative(photosRoot, abs).replaceAll("\\", "/");
    const src = `/photos/${rel}`;
    const key = listingSrcToR2Key(src);
    if (!key) continue;
    const bytes = statSync(abs).size;
    files.push({
      abs,
      rel,
      src,
      key,
      bytes,
      contentType: contentTypeForPhotoPath(rel),
      group: groupForRel(rel),
      tooLarge: bytes > R2_MAX_OBJECT_BYTES,
    });
  }
  return files;
}

function mappedMissing(workspaceRoot, jsonRel, label) {
  const full = join(workspaceRoot, jsonRel);
  if (!existsSync(full)) return { label, mapped: 0, onDisk: 0, missing: [] };
  const data = JSON.parse(readFileSync(full, "utf8"));
  const missing = [];
  let onDisk = 0;
  for (const [id, src] of Object.entries(data)) {
    const path = join(workspaceRoot, "public", String(src).replace(/^\//, ""));
    if (existsSync(path)) onDisk += 1;
    else missing.push({ id, src });
  }
  return { label, mapped: Object.keys(data).length, onDisk, missing };
}

export function collectPhotoInventory(workspaceRoot = root) {
  const files = collectPhotoFiles(workspaceRoot);
  const byDir = {};
  let bytes = 0;
  let logos = 0;
  for (const file of files) {
    byDir[file.group] = (byDir[file.group] || 0) + 1;
    bytes += file.bytes;
    if (file.rel.includes("-logo")) logos += 1;
  }
  const official = mappedMissing(
    workspaceRoot,
    "src/lib/data/real-storefronts.json",
    "real-storefronts.json",
  );
  const wpg = mappedMissing(workspaceRoot, "src/lib/data/storefronts.json", "storefronts.json");
  return {
    generatedAt: new Date().toISOString(),
    photoRoot: PHOTO_ROOT_REL,
    keyPrefix: `${R2_ORIGINALS_PREFIX}/`,
    mapping: `/photos/{rel} → ${R2_ORIGINALS_PREFIX}/{rel}`,
    filesOnDisk: files.length,
    bytes,
    logos,
    byDir,
    listings: {
      officialBuildings: {
        mapped: official.mapped,
        onDisk: official.onDisk,
        missingOnDisk: official.missing.length,
        missingIds: official.missing.map((row) => row.id),
      },
      wpgStorefronts: {
        mapped: wpg.mapped,
        onDisk: wpg.onDisk,
        missingOnDisk: wpg.missing.length,
      },
    },
    tooLarge: files.filter((f) => f.tooLarge).map((f) => ({ src: f.src, bytes: f.bytes })),
    files,
  };
}

export function inventorySummary(inventory) {
  const { files: _files, ...summary } = inventory;
  return summary;
}

function helpText() {
  return `Migrate public/photos originals into private R2 (kidease-media).

Key mapping: /photos/{rel} → originals/{rel}
Git files are never deleted.

Usage:
  node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --inventory
  node --experimental-strip-types scripts/migrate-photos-to-r2.mjs
  node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --apply

Options:
  --inventory         Print counts and listing gaps (no upload)
  --inventory-full    Include every file's src/key in the JSON
  --dry-run           Plan only (default)
  --apply             Upload missing objects using R2_* env
  --force             Overwrite objects that already exist
  --only <group>      buildings | wpg | storefront | team | root
  --limit <n>         Cap uploads (useful for a smoke test)
  --concurrency <n>   Parallel PUTs (default 4, max 16)
  --help

Env (server-only, same names as Vercel Production):
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_ENDPOINT or R2_ACCOUNT_ID
  R2_BUCKET=kidease-media
  R2_READ_ORIGINALS=0   # optional: keep /img on Git until migrate finishes
`;
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, run));
  return results;
}

export async function runMigrate(argv = process.argv.slice(2), workspaceRoot = root, env = process.env) {
  const args = parseMigrateArgs(argv);
  if (args.help) {
    return { ok: true, help: helpText() };
  }

  const inventory = collectPhotoInventory(workspaceRoot);
  if (args.inventory) {
    return {
      ok: true,
      inventory: args.inventoryFull ? inventory : inventorySummary(inventory),
    };
  }

  let planned = inventory.files.filter((file) => !file.tooLarge);
  if (args.only) planned = planned.filter((file) => file.group === args.only);
  if (args.limit) planned = planned.slice(0, args.limit);

  const plan = {
    mode: args.apply ? "apply" : "dry-run",
    force: args.force,
    only: args.only || null,
    limit: args.limit || null,
    planned: planned.length,
    skippedTooLarge: inventory.tooLarge.length,
    sample: planned.slice(0, 5).map((file) => ({ src: file.src, key: file.key, bytes: file.bytes })),
  };

  if (!args.apply) {
    return { ok: true, plan, inventory: inventorySummary(inventory) };
  }

  const missing = r2MissingEnv(env);
  const resolved = resolveR2Config(env);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      missing,
      plan,
    };
  }

  const { headR2Object, putR2ObjectBytes } = await import("../src/lib/server/r2.server.ts");
  const uploaded = [];
  const skipped = [];
  const failed = [];

  await mapPool(planned, args.concurrency, async (file) => {
    try {
      if (!args.force) {
        const head = await headR2Object(file.key);
        if (head.exists) {
          skipped.push({ key: file.key, reason: "exists" });
          return;
        }
      }
      const body = readFileSync(file.abs);
      const result = await putR2ObjectBytes({
        key: file.key,
        contentType: file.contentType,
        body,
      });
      uploaded.push({ key: result.key, bytes: result.bytes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "upload failed";
      failed.push({ key: file.key, error: message });
    }
  });

  return {
    ok: failed.length === 0,
    plan,
    uploaded: uploaded.length,
    skipped: skipped.length,
    failed,
  };
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrate()
    .then((result) => {
      if (result.help) {
        console.log(result.help);
        return;
      }
      const payload = { ...result };
      delete payload.help;
      console.log(JSON.stringify(payload, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "migrate failed";
      console.error(message);
      process.exitCode = 1;
    });
}
