import { getSql } from "@/lib/db";
import { splitPhotoList } from "@/lib/listing-photo";
import { healthFromDaycareRow } from "@/lib/profile-health-row";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { compareTimeDesc } from "@/lib/sort-time";
import { licenseReviewMarker } from "@/lib/private-docs";
import { overlayStoredLicensePhotos } from "@/lib/server/license-photo-ref";
import { collapseDuplicateReviewCards, hasLicenceEvidence } from "@/lib/approve-live";
import { mapAdminCentreSqlRow, type AdminCentreSqlRow } from "@/lib/admin-centres-map";
import { incompleteMissing } from "@/lib/listing-incomplete";
import type { AdminCentreRow } from "@/lib/server/admin-centres";

/**
 * Admin desk test #34: inline data: photos were sent for every card (up to 4 each,
 * ~290 cards), which made /admin's first payload huge and crashed the tab.
 * Keep small inline images; drop large ones from the queue payload. Hosted photo URLs are unchanged,
 * and photoCount still counts every real photo.
 */
export const QUEUE_INLINE_PHOTO_MAX = 60_000;

export function queuePhotoOk(p: string): boolean {
  if (p.startsWith("data:image")) return p.length <= QUEUE_INLINE_PHOTO_MAX;
  return isRealListingPhoto(p);
}

/** Licence + storefront photos for Admin verify — daycare photos, not the raw CSV. */
function firstReviewPhoto(photos?: string | null, licensePhoto?: string | null) {
  const storefront = splitPhotoList(photos).find(queuePhotoOk);
  return {
    licensePhoto: licenseReviewMarker(licensePhoto),
    storefrontPhoto: storefront || null,
  };
}

type FraudFlag = { score: number | null; reasons: string; createdAt: string };

/**
 * Claim and spam flags per centre, newest first, three at most. A missing table or a
 * failed read gives no flags; it must not empty the queue.
 */
async function readClaimFraudFlags(sql: Awaited<ReturnType<typeof getSql>>, ids: string[]): Promise<Map<string, FraudFlag[]>> {
  const out = new Map<string, FraudFlag[]>();
  if (!ids.length) return out;
  const rows = await sql
    .query<{ daycare_id: string; score: number | null; reasons: string | null; created_at: string | Date }>(
      `select daycare_id, score, reasons, created_at
       from fraud_flags
       where daycare_id = any($1::text[])
       order by created_at desc
       limit 2000`,
      [ids],
    )
    .catch(() => [] as { daycare_id: string; score: number | null; reasons: string | null; created_at: string | Date }[]);
  for (const row of rows) {
    const list = out.get(row.daycare_id) ?? [];
    if (list.length >= 3) continue;
    list.push({
      score: row.score == null ? null : Number(row.score),
      reasons: String(row.reasons || "").slice(0, 200),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    });
    out.set(row.daycare_id, list);
  }
  return out;
}

/** Server-only queue read. Caller must authorize before invoking; no subscription enrichment. */
export async function readAdminCentreQueueRows(): Promise<AdminCentreRow[]> {
  const sql = await getSql();
  // LATERAL keeps one claim + one provider link per centre (no claim×member
  // cartesian). Do not swallow errors as [] — that looks like an empty queue.
  let rows: AdminCentreSqlRow[];
  try {
    rows = await sql<AdminCentreSqlRow>`
      select
        d.id as daycare_id,
        d.slug,
        d.name,
        d.address,
        d.city,
        d.province,
        d.phone,
        d.contact_email,
        d.claim_status,
        d.claimed_at,
        c.id as claim_id,
        c.status as claim_row_status,
        coalesce(c.user_id, pd.user_id) as provider_user_id,
        pd.user_id as provider_link_user_id,
        u.name as provider_name,
        u.email as provider_email,
        coalesce(c.created_at, d.claimed_at, d.created_at) as submitted_at,
        c.reviewed_at,
        c.review_note,
        d.license_number,
        d.license_status,
        d.license_expiry::text as license_expiry,
        d.licensed_capacity,
        d.registry_match_state,
        d.license_verified_at,
        d.license_verification_source,
        d.staff_screening_attested,
        d.staff_screening_attested_at,
        d.screening_on_file,
        d.screening_on_file_at,
        coalesce(nullif(btrim(c.license_photo), ''), nullif(btrim(d.license_photo), '')) as license_photo,
        d.photos,
        d.hours,
        d.infant_monthly,
        d.toddler_monthly,
        d.preschool_monthly,
        d.part_time_monthly,
        d.ages_confirmed,
        d.age_min_months,
        d.age_max_months,
        d.last_photo_updated_at,
        d.last_vacancy_updated_at,
        d.created_at,
        d.visibility,
        d.is_test,
        d.merged_into,
        keeper.name as merged_into_name,
        d.import_fault,
        d.review_of
      from daycares d
      left join daycares keeper on keeper.id = d.merged_into
      left join lateral (
        select id, status, user_id, created_at, reviewed_at, review_note, license_photo
        from listing_claims
        where daycare_id = d.id
        order by
          case
            when status in ('waiting', 'pending', 'verified') then 0
            when status = 'approved' then 1
            when status = 'superseded' then 3
            else 2
          end,
          created_at desc nulls last
        limit 1
      ) c on true
      left join lateral (
        select user_id from provider_daycares where daycare_id = d.id limit 1
      ) pd on true
      left join "user" u on u.id = coalesce(c.user_id, pd.user_id)
      where d.claimed_at is not null
         or lower(btrim(coalesce(d.claim_status, ''))) in ('pending', 'waiting', 'verified', 'approved', 'declined')
         or exists (select 1 from listing_claims lc where lc.daycare_id = d.id)
         or exists (select 1 from provider_daycares pl where pl.daycare_id = d.id)
         or d.is_test = 1
         or d.visibility = 'admin_only'
         or d.slug = 'test-ghost-claim-lab'
         or d.license_number = 'TEST-GHOST-0001'
         or d.id = 'ke-test-ghost-001'
         or d.id ilike 'ke-test-%'
         or d.name like 'TEST %'
         or d.slug ~* '^qa[-_]'
         or d.name ~* '^qa[ _-]'
         or d.name ~* 'qa[[:space:]]+test'
         or d.merged_into is not null
         or nullif(btrim(coalesce(d.import_fault, '')), '') is not null
    `;
  } catch (first) {
    throw first instanceof Error ? first : new Error("Could not load the admin queue.");
  }

  const [withFiles, fraudByCentre] = await Promise.all([
    overlayStoredLicensePhotos(sql, rows),
    readClaimFraudFlags(sql, rows.map((r) => r.daycare_id)),
  ]);
  const mapped: AdminCentreRow[] = withFiles.map((r) => {
    const row = mapAdminCentreSqlRow(r);
    const live =
      row.claimStatus === "approved" &&
      hasLicenceEvidence({
        id: r.daycare_id,
        daycareId: r.daycare_id,
        licenseNumber: r.license_number,
        licenseStatus: r.license_status,
        licenseVerificationSource: r.license_verification_source,
        province: r.province,
      });
    const photos = firstReviewPhoto(r.photos, r.license_photo);
    const realPhotos = splitPhotoList(r.photos).filter(
      (p) => isRealListingPhoto(p) || p.startsWith("data:image"),
    );
    const health = healthFromDaycareRow({
      photos: r.photos,
      license_number: r.license_number,
      license_status: r.license_status,
      license_expiry: r.license_expiry,
      registry_match_state: r.registry_match_state,
      license_photo: r.license_photo,
      screening_on_file: r.screening_on_file,
      staff_screening_attested: r.staff_screening_attested,
      province: r.province,
      infant_monthly: r.infant_monthly ?? null,
      toddler_monthly: r.toddler_monthly ?? null,
      preschool_monthly: r.preschool_monthly ?? null,
      part_time_monthly: r.part_time_monthly ?? null,
      ages_confirmed: r.ages_confirmed ?? null,
      age_min_months: r.age_min_months ?? null,
      age_max_months: r.age_max_months ?? null,
      hours: r.hours ?? null,
      phone: r.phone ?? null,
      contact_email: r.contact_email ?? null,
      address: r.address ?? null,
    });
    return {
      ...row,
      live,
      ...photos,
      photoCount: realPhotos.length,
      photoThumbs: realPhotos.filter(queuePhotoOk).slice(0, 4),
      fraudFlags: fraudByCentre.get(r.daycare_id) ?? [],
      health,
      missing: incompleteMissing({
        claimStatus: row.claimStatus,
        claimedAt: row.claimedAt,
        claimRowStatus: r.claim_row_status,
        hasProviderLink: row.hasProviderLink,
        hasListingClaim: row.hasListingClaim,
        live,
        licensePhoto: photos.licensePhoto,
        screeningOnFile: row.screeningOnFile,
        photos: r.photos,
        storefrontPhoto: photos.storefrontPhoto,
        province: r.province,
        infantMonthly: r.infant_monthly ?? null,
        toddlerMonthly: r.toddler_monthly ?? null,
        preschoolMonthly: r.preschool_monthly ?? null,
        partTimeMonthly: r.part_time_monthly ?? null,
        agesKnown: r.ages_confirmed === 1 || r.ages_confirmed === true,
        ageMinMonths: r.age_min_months ?? 0,
        ageMaxMonths: r.age_max_months ?? 0,
        hours: r.hours,
      }),
    };
  });

  const rank = (s: string) => (s === "waiting" || s === "pending" ? 0 : s === "approved" ? 1 : 2);
  const merged = mapped.filter((row) => row.mergedInto);
  const faults = mapped.filter((row) => row.importFault && !row.mergedInto);
  const visible = collapseDuplicateReviewCards(
    mapped.filter((row) => !row.mergedInto && !row.importFault && row.claimStatus !== "superseded"),
  );
  visible.sort(
    (a, b) =>
      rank(a.claimStatus) - rank(b.claimStatus) ||
      compareTimeDesc(a.submittedAt, b.submittedAt) ||
      a.name.localeCompare(b.name),
  );
  const hidden = [...merged, ...faults].sort((a, b) => a.name.localeCompare(b.name));
  return [...visible, ...hidden];
}
