/**
 * Authoritative Approve. Validates licence + screening, picks one claim,
 * writes Approved + Live, suppresses duplicates, syncs trust and the
 * verified map point, then clears the search memo. Returns the health
 * result Admin must show — ok is false when any downstream check failed,
 * and the listing is not marked Live in that case.
 */

import { planApproval, type ApprovalCentre, type ApprovalClaim, type ApprovalHealth } from "@/lib/approve-live";
import { normalizeCentreName } from "@/lib/listing-identity";
import type { Sql } from "@/lib/db";
import { resetNeonCatalogCache } from "@/lib/server/catalog-neon";
import { flushSearchMemo } from "@/lib/server/search-memo";

type CentreRow = {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  contact_email: string | null;
  lat: number | null;
  lng: number | null;
  license_number: string | null;
  license_photo: string | null;
  license_status: string | null;
  license_verification_source: string | null;
  claim_status: string | null;
  claimed_at: string | null;
  listing_active: number | boolean | null;
  rating_x10: number | null;
  review_count: number | null;
  staff_screening_attested: number | boolean | null;
  screening_on_file: number | boolean | null;
};

function flagged(value: number | boolean | null | undefined) {
  return value === 1 || value === true;
}

function toCentre(row: CentreRow, licensePhoto: string | null): ApprovalCentre {
  return {
    id: row.id,
    daycareId: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    province: row.province,
    lat: row.lat,
    lng: row.lng,
    licenseNumber: row.license_number,
    licensePhoto,
    licenseStatus: row.license_status,
    licenseVerificationSource: row.license_verification_source,
    screeningOnFile: flagged(row.screening_on_file),
    staffScreeningAttested: flagged(row.staff_screening_attested),
    claimStatus: row.claim_status,
    claimedAt: row.claimed_at,
    listingActive: row.listing_active === 0 || row.listing_active === false ? false : true,
    ratingX10: Number(row.rating_x10) || 0,
    reviewCount: Number(row.review_count) || 0,
  };
}

async function syncVerifiedLocation(sql: Sql, id: string, lat: number, lng: number) {
  await sql`
    update daycares
    set lat = ${lat}, lng = ${lng}
    where id = ${id}
  `;
  await sql
    .query(
      `update daycares
       set location = st_setsrid(st_makepoint(lng, lat), 4326)::geography
       where id = $1
         and exists (select 1 from pg_extension where extname = 'postgis')
         and exists (
           select 1 from information_schema.columns
           where table_name = 'daycares' and column_name = 'location'
         )`,
      [id],
    )
    .catch(() => undefined);
}

export async function runApproval(
  sql: Sql,
  input: { daycareId: string; actorUserId: string; note?: string | null },
): Promise<{ ok: boolean; status: string; health: ApprovalHealth }> {
  const listed = await sql<CentreRow>`
    select id, slug, name, address, city, province, contact_email,
      lat, lng, license_number, license_photo, license_status, license_verification_source,
      claim_status, claimed_at, listing_active, rating_x10, review_count,
      staff_screening_attested, screening_on_file
    from daycares
    where id = ${input.daycareId}
    limit 1
  `;
  const row = listed[0];
  if (!row) {
    const health: ApprovalHealth = {
      ok: false,
      failed: ["approved_live"],
      checks: [{ id: "approved_live", ok: false, detail: "Centre not found" }],
    };
    return { ok: false, status: "missing", health };
  }

  const claims = await sql<{ id: string; status: string | null; created_at: string | null; license_photo: string | null }>`
    select id, status, created_at, license_photo
    from listing_claims
    where daycare_id = ${row.id}
    order by created_at desc
  `.catch(() => [] as { id: string; status: string | null; created_at: string | null; license_photo: string | null }[]);

  const approvalClaims: ApprovalClaim[] = claims.map((claim) => ({
    id: claim.id,
    status: claim.status,
    createdAt: claim.created_at,
    licensePhoto: claim.license_photo,
  }));
  const photo =
    (row.license_photo || "").trim() ||
    approvalClaims.map((claim) => (claim.licensePhoto || "").trim()).find(Boolean) ||
    null;

  const licence = (row.license_number || "").trim();
  const nameToken = normalizeCentreName(row.name || "");
  const others = await sql<{
    id: string;
    name: string;
    city: string;
    province: string;
    license_number: string | null;
    claim_status: string | null;
    claimed_at: string | null;
  }>`
    select id, name, city, province, license_number, claim_status, claimed_at
    from daycares
    where id <> ${row.id}
      and coalesce(claim_status, '') <> 'superseded'
      and (
        (${licence} <> '' and license_number = ${licence})
        or (
          ${nameToken} <> ''
          and lower(btrim(coalesce(city, ''))) = lower(btrim(${row.city || ""}))
          and upper(btrim(coalesce(province, ''))) = upper(btrim(${row.province || ""}))
          and lower(name) like ${`%${nameToken}%`}
        )
      )
    limit 40
  `.catch(
    () =>
      [] as {
        id: string;
        name: string;
        city: string;
        province: string;
        license_number: string | null;
        claim_status: string | null;
        claimed_at: string | null;
      }[],
  );

  const plan = planApproval(
    toCentre(row, photo),
    approvalClaims,
    others.map((other) => ({
      id: other.id,
      daycareId: other.id,
      name: other.name,
      city: other.city,
      province: other.province,
      licenseNumber: other.license_number,
      claimStatus: other.claim_status,
      claimedAt: other.claimed_at,
    })),
  );

  if (!plan.ok || !plan.next) {
    return { ok: false, status: row.claim_status || "waiting", health: plan.health };
  }

  const next = plan.next;
  try {
    await sql`
      update daycares
      set claimed_at = coalesce(claimed_at, now()),
          claim_status = 'approved',
          listing_active = 1,
          verified = 1,
          license_number = ${next.licenseNumber || null},
          license_status = 'matched',
          registry_match_state = 'matched',
          license_verification_source = ${next.licenseVerificationSource || "admin"},
          license_verified_at = coalesce(license_verified_at, now())
      where id = ${row.id}
    `;
    await syncVerifiedLocation(sql, row.id, Number(next.lat), Number(next.lng));
    if (plan.canonicalClaimId) {
      await sql`
        update listing_claims
        set status = 'approved',
            reviewed_at = now(),
            reviewed_by = ${input.actorUserId},
            review_note = ${input.note?.trim() || null}
        where id = ${plan.canonicalClaimId}
      `;
    }
    for (const claimId of plan.suppressClaimIds) {
      await sql`
        update listing_claims
        set status = 'superseded',
            reviewed_at = now(),
            reviewed_by = ${input.actorUserId},
            review_note = coalesce(review_note, ${"Superseded by the canonical claim"})
        where id = ${claimId}
      `;
    }
    for (const daycareId of plan.suppressDaycareIds) {
      await sql`
        update daycares
        set listing_active = 0,
            claim_status = 'superseded'
        where id = ${daycareId}
      `;
      await sql`
        update listing_claims
        set status = 'superseded',
            reviewed_at = now(),
            reviewed_by = ${input.actorUserId},
            review_note = coalesce(review_note, ${"Superseded by the canonical centre"})
        where daycare_id = ${daycareId}
          and status <> 'superseded'
      `;
    }
  } catch (err) {
    console.error("[kidease-approve] write failed", err);
    const health: ApprovalHealth = {
      ok: false,
      failed: ["approved_live"],
      checks: [{ id: "approved_live", ok: false, detail: "Approved and Live could not be saved" }],
    };
    return { ok: false, status: row.claim_status || "waiting", health };
  }

  try {
    flushSearchMemo();
    resetNeonCatalogCache();
  } catch (err) {
    console.error("[kidease-approve] search memo flush failed", err);
    const health: ApprovalHealth = {
      ok: false,
      failed: ["search_memo"],
      checks: plan.health.checks.map((check) =>
        check.id === "search_memo" ? { ...check, ok: false, detail: "Search memo was not cleared" } : check,
      ),
    };
    health.failed = health.checks.filter((check) => !check.ok).map((check) => check.id);
    return { ok: false, status: "approved", health };
  }

  return { ok: true, status: "approved", health: plan.health };
}
