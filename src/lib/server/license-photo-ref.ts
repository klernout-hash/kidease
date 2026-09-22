/**
 * Resolve a stored licence file for Admin review.
 * The listing number (daycares.license_number) is a different field.
 * A file may live on the daycare row, any claim, or an enroll upload.
 * This only reads a ref that was already stored. It does not invent a PDF.
 */

import type { Sql } from "@/lib/db";

type PhotoRow = {
  daycare_id: string;
  license_photo: string | null;
};

function blank(value: string | null | undefined) {
  return !(value || "").trim();
}

const LATEST_CLAIM_PHOTO = `select distinct on (daycare_id) daycare_id, license_photo
  from listing_claims
  where daycare_id = any($1::text[])
    and license_photo is not null
    and btrim(license_photo) <> ''
  order by daycare_id, created_at desc nulls last`;

const LATEST_UPLOAD_PHOTO = `select distinct on (daycare_id) daycare_id, license_photo
  from license_uploads
  where daycare_id = any($1::text[])
    and license_photo is not null
    and btrim(license_photo) <> ''
  order by daycare_id, created_at desc nulls last`;

async function latestPhotoByDaycare(sql: Sql, text: string, ids: string[]) {
  if (!ids.length) return [];
  return sql
    .query<{ daycare_id: string; license_photo: string }>(text, [ids])
    .catch(() => [] as Array<{ daycare_id: string; license_photo: string }>);
}

/**
 * When the selected claim and the daycare column are both empty, keep a file
 * that was stored on another claim or on license_uploads.
 */
export async function overlayStoredLicensePhotos<T extends PhotoRow>(sql: Sql, rows: T[]): Promise<T[]> {
  const missing = rows.filter((row) => blank(row.license_photo)).map((row) => row.daycare_id);
  if (!missing.length) return rows;
  const claims = await latestPhotoByDaycare(sql, LATEST_CLAIM_PHOTO, missing);
  const found = new Set(claims.map((row) => row.daycare_id));
  const uploads = await latestPhotoByDaycare(
    sql,
    LATEST_UPLOAD_PHOTO,
    missing.filter((id) => !found.has(id)),
  );
  const byId = new Map<string, string>();
  for (const row of uploads) byId.set(row.daycare_id, row.license_photo);
  for (const row of claims) byId.set(row.daycare_id, row.license_photo);
  return rows.map((row) => {
    if (!blank(row.license_photo)) return row;
    const photo = byId.get(row.daycare_id);
    return photo ? { ...row, license_photo: photo } : row;
  });
}

/**
 * Persist a licence file the caller already uploaded.
 * Writes `daycares.license_photo` and the claim copy from #249.
 * Admin updates every claim on the daycare so an older claim photo cannot hide the new file.
 * A provider update stays on that user's claim. Does not write `license_number` or invent a PDF.
 */
export async function writeStoredLicensePhoto(
  sql: Sql,
  input: {
    daycareId: string;
    storageRef: string;
    claimScope: "daycare" | "actor";
    actorUserId: string;
  },
): Promise<void> {
  const storageRef = input.storageRef.trim();
  if (!storageRef) throw new Error("File not found");
  const updated = await sql.query<{ id: string }>(
    `update daycares set license_photo = $1 where id = $2 returning id`,
    [storageRef, input.daycareId],
  );
  if (!updated[0]) throw new Error("Daycare not found");
  const claimSql =
    input.claimScope === "daycare"
      ? `update listing_claims set license_photo = $1 where daycare_id = $2`
      : `update listing_claims set license_photo = $1 where daycare_id = $2 and user_id = $3`;
  const params =
    input.claimScope === "daycare"
      ? [storageRef, input.daycareId]
      : [storageRef, input.daycareId, input.actorUserId];
  const claimWrite = sql.query(claimSql, params);
  if (input.claimScope === "actor") {
    await claimWrite.catch(() => undefined);
    return;
  }
  await claimWrite;
}
