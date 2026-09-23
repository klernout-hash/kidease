#!/usr/bin/env node
/**
 * Reprocess centre-uploaded listing photos (data:image JPEG/PNG/WebP).
 * Straightens, sharpens, and frames them with the same pipeline as upload.
 *
 *   DATABASE_URL=… node --experimental-strip-types scripts/reprocess-listing-photos.mjs --slug kids-world-daycare-kh2t
 *   DATABASE_URL=… node --experimental-strip-types scripts/reprocess-listing-photos.mjs --id <daycare id> --dry-run
 *
 * Pass any centre slug or id. Catalogue /photos/… files, licence scans, and
 * screening docs are left alone. Claim status and Live gates are not changed.
 * A photo sharp cannot read fails the run before any write.
 */
import { fileURLToPath } from "node:url";
import pg from "pg";
import { polishStoredPhotoList } from "../src/lib/server/polish-listing-photo.ts";

export function parseReprocessArgs(argv) {
  let slug = "";
  let id = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--slug") slug = String(argv[++i] || "").trim();
    else if (arg === "--id") id = String(argv[++i] || "").trim();
    else if (arg.startsWith("--slug=")) slug = arg.slice("--slug=".length).trim();
    else if (arg.startsWith("--id=")) id = arg.slice("--id=".length).trim();
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!slug && !id) {
    throw new Error(
      "Pass --slug or --id. Example: --slug kids-world-daycare-kh2t",
    );
  }
  if (slug && id) throw new Error("Pass --slug or --id, not both.");
  return { slug, id, dryRun };
}

export async function reprocessListingPhotosInDb(databaseUrl, args) {
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const found = args.id
      ? await client.query(`select id, slug, photos from daycares where id = $1 limit 1`, [args.id])
      : await client.query(`select id, slug, photos from daycares where slug = $1 limit 1`, [args.slug]);
    const row = found.rows[0];
    if (!row) throw new Error("Centre not found");
    const previous = String(row.photos ?? "");
    const result = await polishStoredPhotoList(previous);
    const changed = result.photos !== previous;
    if (changed && !args.dryRun) {
      try {
        await client.query(
          `update daycares set photos = $1, last_photo_updated_at = now() where id = $2`,
          [result.photos, row.id],
        );
      } catch {
        await client.query(`update daycares set photos = $1 where id = $2`, [result.photos, row.id]);
      }
    }
    return {
      daycareId: row.id,
      slug: row.slug,
      polished: result.polished,
      keptOriginal: result.keptOriginal,
      skipped: result.skipped,
      changed,
      dryRun: args.dryRun,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = parseReprocessArgs(process.argv.slice(2));
  const summary = await reprocessListingPhotosInDb(process.env.DATABASE_URL, args);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
