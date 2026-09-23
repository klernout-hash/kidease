import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, lookupUser, notifyPlatform } from "@/lib/server/notify";
import { notifyClaimStatusSms } from "@/lib/server/sms";
import { requireAdmin } from "@/lib/server/roles";
import { writeTrustEvent } from "@/lib/server/trust";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { splitPhotoList } from "@/lib/listing-photo";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { compareTimeDesc } from "@/lib/sort-time";
import { transactionalMailFrom } from "@/lib/mail-from";
import { licenseReviewMarker } from "@/lib/private-docs";
import { overlayStoredLicensePhotos } from "@/lib/server/license-photo-ref";
import { collapseDuplicateReviewCards, hasLicenceEvidence } from "@/lib/approve-live";
import { runApproval } from "@/lib/server/approve-centre";
import { mapAdminCentreSqlRow, type AdminCentreSqlRow } from "@/lib/admin-centres-map";
import {
  incompleteMissing,
  selectIncompleteRows,
  type IncompleteMissingField,
} from "@/lib/listing-incomplete";

export type AdminCentreRow = {
  daycareId: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  phone: string | null;
  contactEmail: string | null;
  claimStatus: string;
  claimedAt: string | null;
  live: boolean;
  claimId: string | null;
  claimRowStatus: string | null;
  providerUserId: string | null;
  providerName: string | null;
  providerEmail: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  licenseNumber: string | null;
  licenseStatus: string;
  licenseExpiry: string | null;
  licensedCapacity: number | null;
  registryMatchState: string;
  licenseVerifiedAt: string | null;
  licenseVerificationSource: string | null;
  staffScreeningAttested: boolean;
  staffScreeningAttestedAt: string | null;
  screeningOnFile: boolean;
  screeningOnFileAt: string | null;
  licensePhoto: string | null;
  storefrontPhoto: string | null;
  isTest: boolean;
  hasProviderLink: boolean;
  hasListingClaim: boolean;
  missing: IncompleteMissingField[];
  updatedAt: string | null;
};

/** Licence + storefront photos for Admin verify — daycare photos, not the raw CSV. */
function firstReviewPhoto(photos?: string | null, licensePhoto?: string | null) {
  const storefront = splitPhotoList(photos).find((p) => isRealListingPhoto(p) || p.startsWith("data:image"));
  return {
    licensePhoto: licenseReviewMarker(licensePhoto),
    storefrontPhoto: storefront || null,
  };
}

export type Decision = "approve" | "decline" | "waiting";

async function requireOperator(userId: string) {
  return requireAdmin(userId);
}

async function deliverToProvider(to: string, subject: string, text: string) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return "skip";
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;font-size:16px;line-height:1.6;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <p style="margin:16px 0 0;white-space:pre-wrap;">${text
        .replace(/&/g, "&#38;")
        .replace(/</g, "&#60;")
        .replace(/>/g, "&#62;")
        .replace(/\n/g, "<br/>")}</p>
      <p style="margin:24px 0 0;">KidEase Support<br/><a href="mailto:${SUPPORT_INBOX_EMAIL}" style="color:#1a3790;">${SUPPORT_INBOX_EMAIL}</a></p>
    </td></tr>
  </table>
</body></html>`;
  const from = transactionalMailFrom();
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: ADMIN_EMAIL, subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent";
  }
  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const fromMatch = from.match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromMatch?.[2]?.trim() || ADMIN_EMAIL, name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
        reply_to: { email: ADMIN_EMAIL },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return "sent";
  }
  console.info("[kidease-mail] provider-decision", to, subject, "\n", text);
  return "logged";
}

function decisionCopy(decision: Decision, name: string) {
  if (decision === "approve") {
    return {
      subject: `${name} is live on KidEase`,
      text: `Hi,\n\nYour listing for ${name} has been approved and is now live on KidEase.\nParents can find you in search, request a spot, and message you in-app.\n\nOpen your dashboard: https://kidease.ca/provider\n\nIf anything on the listing needs a correction, reply to this email or update it from the provider dashboard.`,
    };
  }
  if (decision === "decline") {
    return {
      subject: `Update on ${name} — KidEase listing`,
      text: `Hi,\n\nWe reviewed the claim for ${name} and are not able to publish it on KidEase at this time.\nThe listing is not live for parent requests.\n\nIf you think this is a mistake, or you have a licence document to send, reply to this email and we will take another look.`,
    };
  }
  return {
    subject: `${name} is in review at KidEase`,
    text: `Hi,\n\nYour listing for ${name} is on the KidEase review list.\nIt is not live for parent requests yet. We will email you as soon as it is approved or if we need anything else.\n\nYou can still open the provider dashboard: https://kidease.ca/provider`,
  };
}

export const listAdminCentres = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireOperator(context.userId);
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
          d.is_test
        from daycares d
        left join lateral (
          select id, status, user_id, created_at, reviewed_at, review_note, license_photo
          from listing_claims
          where daycare_id = d.id
          order by
            case
              when status = 'approved' then 0
              when status = 'superseded' then 2
              else 1
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
      `;
    } catch (first) {
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
            'unverified'::text as license_status,
            null::text as license_expiry,
            null::int as licensed_capacity,
            'unmatched'::text as registry_match_state,
            null::timestamptz as license_verified_at,
            null::text as license_verification_source,
            0 as staff_screening_attested,
            null::timestamptz as staff_screening_attested_at,
            0 as screening_on_file,
            null::timestamptz as screening_on_file_at,
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
            null::timestamptz as last_photo_updated_at,
            null::timestamptz as last_vacancy_updated_at,
            d.created_at,
            d.visibility,
            d.is_test
          from daycares d
          left join lateral (
            select id, status, user_id, created_at, reviewed_at, review_note, license_photo
            from listing_claims
            where daycare_id = d.id
            order by created_at desc nulls last
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
        `;
      } catch {
        throw first instanceof Error ? first : new Error("Could not load the admin queue.");
      }
    }

    const withFiles = await overlayStoredLicensePhotos(sql, rows);
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
      return {
        ...row,
        live,
        ...photos,
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
    const visible = collapseDuplicateReviewCards(mapped.filter((row) => row.claimStatus !== "superseded"));
    visible.sort((a, b) => rank(a.claimStatus) - rank(b.claimStatus) || compareTimeDesc(a.submittedAt, b.submittedAt) || a.name.localeCompare(b.name));
    return visible;
  });

/** Incomplete / Needs-complete slice — same rows as listAdminCentres, filtered in-process. */
export function listIncompleteAdminCentres(rows: AdminCentreRow[]): AdminCentreRow[] {
  return selectIncompleteRows(rows).sort(
    (a, b) => compareTimeDesc(a.updatedAt || a.submittedAt, b.updatedAt || b.submittedAt) || a.name.localeCompare(b.name),
  );
}

export const decideCentre = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; decision: Decision; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const decision = data.decision;
    if (!["approve", "decline", "waiting"].includes(decision)) throw new Error("Invalid decision");

    const sql = await getSql();
    const listed = await sql<{
      id: string;
      slug: string;
      name: string;
      address: string;
      city: string;
      province: string;
      contact_email: string | null;
    }>`
      select id, slug, name, address, city, province, contact_email
      from daycares where id = ${data.daycareId} limit 1
    `;
    const centre = listed[0];
    if (!centre) throw new Error("Centre not found");

    let claimStatus = decision === "decline" ? "declined" : "waiting";
    let approvalHealth: Awaited<ReturnType<typeof runApproval>>["health"] | null = null;

    if (decision === "approve") {
      const approved = await runApproval(sql, {
        daycareId: data.daycareId,
        actorUserId: context.userId,
        note: data.note,
      });
      if (!approved.ok) {
        return { ok: false as const, status: approved.status, mailed: "skip", to: null, health: approved.health };
      }
      claimStatus = "approved";
      approvalHealth = approved.health;
    } else {
      await sql`
        update daycares
        set claimed_at = null,
            claim_status = ${claimStatus}
        where id = ${data.daycareId}
      `;
    }

    const latest = await sql<{ id: string; user_id: string }>`
      select id, user_id from listing_claims
      where daycare_id = ${data.daycareId}
        and status <> 'superseded'
      order by case when status = 'approved' then 0 else 1 end, created_at desc
      limit 1
    `;
    if (latest[0] && decision !== "approve") {
      await sql`
        update listing_claims
        set status = ${claimStatus},
            reviewed_at = now(),
            reviewed_by = ${context.userId},
            review_note = ${data.note?.trim() || null}
        where id = ${latest[0].id}
      `.catch(async () => {
        await sql`
          update listing_claims
          set status = ${claimStatus}
          where id = ${latest[0].id}
        `;
      });
    }

    const owner = latest[0]?.user_id
      ? await lookupUser(latest[0].user_id)
      : { email: centre.contact_email, name: null };
    const to = (owner.email || centre.contact_email || "").trim();
    const copy = decisionCopy(decision, centre.name);
    let mail = "skip";
    try {
      mail = await deliverToProvider(to, copy.subject, copy.text);
    } catch (err) {
      mail = "failed";
      console.error("[kidease-mail] decision notify failed", err);
    }

    try {
      const phoneRows = latest[0]?.user_id
        ? await sql<{ phone: string | null }>`
            select phone from profiles where user_id = ${latest[0].user_id} limit 1
          `.catch(() => [] as { phone: string | null }[])
        : [];
      const claimantId = latest[0]?.user_id || "";
      const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
      const casl = claimantId
        ? await evaluateCaslSend({
            userId: claimantId,
            channel: "sms",
            purpose: "service",
            address: phoneRows[0]?.phone,
          })
        : { ok: false as const, skipped: true as const, error: "CASL: no stored express consent for this recipient." };
      await notifyClaimStatusSms({
        to: phoneRows[0]?.phone,
        centreName: centre.name,
        status: claimStatus,
        consentGranted: casl.ok,
      });
    } catch (err) {
      console.error("[kidease-sms] claim status notify failed", err instanceof Error ? err.message : err);
    }

    try {
      await notifyPlatform({
        kind: "claim",
        title:
          decision === "approve"
            ? `Approved: ${centre.name}`
            : decision === "decline"
              ? `Declined: ${centre.name}`
              : `Waiting: ${centre.name}`,
        daycareName: centre.name,
        address: centre.address,
        city: centre.city,
        province: centre.province,
        slug: centre.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `Operator set ${centre.name} to ${claimStatus}. Provider notice: ${mail}.${data.note ? ` Note: ${data.note}` : ""}`,
      });
    } catch (err) {
      console.error("[kidease-mail] decision admin event failed", err);
    }

    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: `claim_${claimStatus}`,
      note: data.note?.trim() || null,
      payload: JSON.stringify({
        decision,
        claimStatus,
        mailed: mail,
        health: approvalHealth?.ok ?? null,
        failed: approvalHealth?.failed ?? [],
      }),
    });

    return {
      ok: true as const,
      status: claimStatus,
      mailed: mail,
      to: to || null,
      health: approvalHealth,
    };
  });
