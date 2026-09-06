import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { requireAdmin } from "@/lib/server/roles";
import { lookupUser, notifyPlatform } from "@/lib/server/notify";
import { JURISDICTIONS } from "@/lib/province-registry";
import { lookupRegistry } from "@/lib/server/registry-adapters";
import { type LicenseStatus, type RegistryMatchState } from "@/lib/trust";

const REPORT_REASONS = new Set(["license", "unlicensed", "ownership", "photo", "other"]);

export type LicenseReviewAction = "matched" | "mismatch" | "expired" | "suspended" | "unverified";

export type AdminReportRow = {
  id: string;
  daycareId: string;
  name: string;
  city: string;
  province: string;
  slug: string;
  reason: string;
  detail: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  createdAt: string;
};

export async function writeTrustEvent(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: { daycareId: string; actorUserId?: string | null; kind: string; note?: string | null; payload?: string | null },
) {
  await sql`
    insert into listing_trust_events (id, daycare_id, actor_user_id, kind, note, payload)
    values (
      ${nid("te")},
      ${input.daycareId},
      ${input.actorUserId || null},
      ${input.kind},
      ${input.note || null},
      ${input.payload || null}
    )
  `.catch(() => undefined);
}

export const attestStaffScreening = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!own[0]) throw new Error("Not your listing");
    await sql`
      update daycares
      set staff_screening_attested = 1,
          staff_screening_attested_at = now(),
          staff_screening_attested_by = ${context.userId}
      where id = ${data.daycareId}
    `;
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: "staff_attestation",
      note: "Provider attested required vulnerable-sector checks. KidEase recorded the attestation and did not validate certificates.",
    });
    return { ok: true as const };
  });

export const saveLicenseFields = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; licenseNumber: string; licenseExpiry?: string; licensedCapacity?: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!own[0]) throw new Error("Not your listing");
    const number = data.licenseNumber.trim().slice(0, 80);
    const expiry = (data.licenseExpiry || "").trim().slice(0, 10) || null;
    const capacity =
      typeof data.licensedCapacity === "number" && data.licensedCapacity > 0
        ? Math.min(400, Math.round(data.licensedCapacity))
        : null;
    await sql`
      update daycares
      set license_number = ${number || null},
          license_expiry = ${expiry},
          licensed_capacity = ${capacity},
          license_verification_source = coalesce(license_verification_source, ${"provider"})
      where id = ${data.daycareId}
    `;
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: "license_fields",
      note: "Provider updated licence fields. Status stays unverified until an operator matches the registry.",
      payload: JSON.stringify({ licenseNumber: number || null, licenseExpiry: expiry, licensedCapacity: capacity }),
    });
    return { ok: true as const };
  });

export const reportListing = createServerFn({ method: "POST" })
  .validator((input: {
    daycareId: string;
    reason: string;
    detail?: string;
    name?: string;
    email?: string;
    turnstileToken?: string;
  }) => input)
  .handler(async ({ data }) => {
    const { assertTurnstileToken } = await import("@/lib/server/turnstile");
    await assertTurnstileToken(data.turnstileToken);
    const reason = data.reason.trim().toLowerCase();
    if (!REPORT_REASONS.has(reason)) throw new Error("Choose a reason");
    const sql = await getSql();
    const listed = await sql<{ id: string; name: string; city: string; province: string; slug: string }>`
      select id, name, city, province, slug from daycares where id = ${data.daycareId} limit 1
    `;
    const centre = listed[0];
    if (!centre) throw new Error("Listing not found");
    const id = nid("rp");
    await sql`
      insert into listing_reports (id, daycare_id, reporter_name, reporter_email, reason, detail)
      values (
        ${id},
        ${data.daycareId},
        ${(data.name || "").trim().slice(0, 120) || null},
        ${(data.email || "").trim().slice(0, 200) || null},
        ${reason},
        ${(data.detail || "").trim().slice(0, 2000) || null}
      )
    `;
    try {
      await notifyPlatform({
        kind: "support",
        title: `Listing report: ${centre.name}`,
        daycareName: centre.name,
        city: centre.city,
        province: centre.province,
        slug: centre.slug,
        actorName: data.name || null,
        actorEmail: data.email || null,
        detail: `Reason: ${reason}${data.detail ? `\n${data.detail}` : ""}`,
      });
    } catch (err) {
      console.error("[kidease-trust] report notify failed", err);
    }
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      kind: "listing_report",
      note: reason,
      payload: (data.detail || "").trim().slice(0, 2000) || null,
    });
    return { ok: true as const };
  });

export const listJurisdictions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      code: string;
      name_en: string;
      name_fr: string;
      registry_url: string | null;
      subsidy_url: string | null;
      adapter_status: string;
      adapter_notes: string | null;
      last_sync_at: string | null;
    }>`
      select code, name_en, name_fr, registry_url, subsidy_url, adapter_status, adapter_notes, last_sync_at
      from ca_jurisdictions
      order by code
    `.catch(() => []);
    if (rows.length) {
      return rows.map((r) => ({
        code: r.code,
        nameEn: r.name_en,
        nameFr: r.name_fr,
        registryUrl: r.registry_url,
        subsidyUrl: r.subsidy_url,
        adapterStatus: r.adapter_status,
        adapterNotes: r.adapter_notes || "",
        lastSyncAt: r.last_sync_at,
        lookup: lookupRegistry(r.code),
      }));
    }
    return JURISDICTIONS.map((j) => ({
      ...j,
      lastSyncAt: null,
      lookup: lookupRegistry(j.code),
    }));
  });

export const listListingReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      name: string;
      city: string;
      province: string;
      slug: string;
      reason: string;
      detail: string | null;
      reporter_name: string | null;
      reporter_email: string | null;
      created_at: string;
    }>`
      select r.id, r.daycare_id, d.name, d.city, d.province, d.slug,
             r.reason, r.detail, r.reporter_name, r.reporter_email, r.created_at
      from listing_reports r
      join daycares d on d.id = r.daycare_id
      order by r.created_at desc
      limit 80
    `.catch(() => []);
    return rows.map((r): AdminReportRow => ({
      id: r.id,
      daycareId: r.daycare_id,
      name: r.name,
      city: r.city,
      province: r.province,
      slug: r.slug,
      reason: r.reason,
      detail: r.detail,
      reporterName: r.reporter_name,
      reporterEmail: r.reporter_email,
      createdAt: r.created_at,
    }));
  });

export const listTrustEvents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      kind: string;
      note: string | null;
      created_at: string;
      actor_user_id: string | null;
    }>`
      select id, kind, note, created_at, actor_user_id
      from listing_trust_events
      where daycare_id = ${data.daycareId}
      order by created_at desc
      limit 20
    `.catch(() => []);
  });

export const reviewLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; action: LicenseReviewAction; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context.userId);
    if (!["matched", "mismatch", "expired", "suspended", "unverified"].includes(data.action)) {
      throw new Error("Invalid licence review");
    }
    const sql = await getSql();
    const listed = await sql<{
      id: string;
      name: string;
      slug: string;
      city: string;
      province: string;
      license_number: string | null;
    }>`
      select id, name, slug, city, province, license_number from daycares where id = ${data.daycareId} limit 1
    `;
    const centre = listed[0];
    if (!centre) throw new Error("Centre not found");

    let status: LicenseStatus = "unverified";
    let match: RegistryMatchState = "unmatched";
    let source: string | null = "admin";
    if (data.action === "matched") {
      status = "matched";
      match = "matched";
    } else if (data.action === "mismatch") {
      status = "unverified";
      match = "mismatch";
    } else if (data.action === "expired") {
      status = "expired";
    } else if (data.action === "suspended") {
      status = "suspended";
    } else {
      status = "unverified";
      match = "unmatched";
      source = null;
    }
    const verifiedAt = data.action === "unverified" ? null : new Date().toISOString();

    await sql`
      update daycares
      set license_status = ${status},
          registry_match_state = ${match},
          license_verified_at = ${verifiedAt},
          license_verification_source = ${source}
      where id = ${data.daycareId}
    `.catch(async () => {
      await sql`
        update daycares set license_status = ${status} where id = ${data.daycareId}
      `;
    });

    const note = data.note?.trim() || null;
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: `license_${data.action}`,
      note,
      payload: JSON.stringify({
        licenseNumber: centre.license_number,
        adapter: lookupRegistry(centre.province, centre.license_number),
      }),
    });

    try {
      await notifyPlatform({
        kind: "listing",
        title: `Licence ${data.action}: ${centre.name}`,
        daycareName: centre.name,
        city: centre.city,
        province: centre.province,
        slug: centre.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `Operator set licence to ${status} / ${match}.${note ? ` Note: ${note}` : ""}`,
      });
    } catch (err) {
      console.error("[kidease-trust] license review notify failed", err);
    }

    return { ok: true as const, status, match };
  });
