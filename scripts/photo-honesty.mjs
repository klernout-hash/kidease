/**
 * Inventory of listing JPEGs that share identical bytes across distinct IDs.
 * Used by tests to keep src/lib/photo-honesty.ts in sync with public/photos.
 *
 * A hash may be reused only when it is in INTENTIONAL_SHARED_PHOTO_SHA256
 * (same-site programs, explicit flag). Everything else is an unflagged
 * shared fallback — cards must not treat those paths as unique storefronts.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LISTING_PHOTO_DIRS = ["wpg", "buildings", "storefront"];

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(abs) {
  return sha256Bytes(readFileSync(abs));
}

export function isListingPhotoFileName(name) {
  if (name.includes("placeholder") || name.includes("-logo")) return false;
  return /\.(jpe?g|png|webp|avif)$/i.test(name);
}

export function collectListingPhotoHashes(root) {
  /** @type {Map<string, string[]>} */
  const byHash = new Map();
  for (const dir of LISTING_PHOTO_DIRS) {
    const absDir = join(root, "public/photos", dir);
    if (!existsSync(absDir)) continue;
    for (const name of readdirSync(absDir).sort()) {
      if (!isListingPhotoFileName(name)) continue;
      const src = `/photos/${dir}/${name}`;
      const hash = sha256File(join(absDir, name));
      const list = byHash.get(hash) || [];
      list.push(src);
      byHash.set(hash, list);
    }
  }
  return byHash;
}

/**
 * @param {string} root
 * @param {readonly string[]} intentionalHashes
 */
export function collectUnflaggedSharedFallbacks(root, intentionalHashes = []) {
  const allow = new Set(intentionalHashes);
  const byHash = collectListingPhotoHashes(root);
  const hashes = [];
  const srcs = [];
  const groups = [];
  for (const [hash, files] of [...byHash.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (files.length < 2) continue;
    const flagged = allow.has(hash);
    groups.push({ hash, srcs: files, flagged });
    if (flagged) continue;
    hashes.push(hash);
    srcs.push(...files);
  }
  srcs.sort();
  hashes.sort();
  return { hashes, srcs, groups };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { hashes, srcs, groups } = collectUnflaggedSharedFallbacks(root, []);
  process.stdout.write(
    `${JSON.stringify({ unflaggedGroups: groups.filter((g) => !g.flagged).length, hashes: hashes.length, srcs: srcs.length }, null, 2)}\n`,
  );
}
