import { createServerFn } from "@tanstack/react-start";
import { readAdminCentreQueueRows } from "@/lib/server/admin-centre-queue";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, lookupUser, notifyPlatform } from "@/lib/server/notify";
import { notifyClaimStatusSms } from "@/lib/server/sms";
import { requireAdmin } from "@/lib/server/roles";
import { writeTrustEvent } from "@/lib/server/trust";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import type { ProfileHealth } from "@/lib/profile-health";
import { loadDaycareHealth } from "@/lib/server/profile-health";
import { compareTimeDesc } from "@/lib/sort-time";
import { transactionalMailFrom } from "@/lib/mail-from";
import { resendCampaignTags } from "@/lib/email-suppressions";
import { adminAddonLine } from "@/lib/centre-addons";
import { runApproval } from "@/lib/server/approve-centre";
import {
  selectIncompleteRows,
  type IncompleteMissingField,
} from "@/lib/listing-incomplete";
import { HIDDEN_REVIEW_POSSIBLE_SECOND_SITE, isAdminOnlyListing } from "@/lib/listing-visibility";
import { gateOutboundEmail } from "@/lib/server/outbound-gate";

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
  /** Real listing photos on file (not placeholders). Drives the profile health score. */
  photoCount?: number;
  /** Up to 4 listing photos for the card's photo strip. */
  photoThumbs?: string[];
  /** Same score the daycare sees on its own desk. */
  health?: ProfileHealth;
  updatedAt: string | null;
  addonLine?: string | null;
  mergedInto: string | null;
  mergedIntoName: string | null;
  importFault: string | null;
  reviewOf: string | null;
};

export type Decision = "approve" | "decline" | "waiting" | "needs_docs";

async function requireOperator(userId: string) {
  return requireAdmin(userId);
}

/**
 * Approve, keep waiting, and needs-a-document.
 * The signed-in operator is the actor, even if a view-as frame overlaid the
 * request user. A missing Cloudflare Access header is not a denial: Access
 * guards the /admin document, and these calls are /_serverFn.
 * Step-up still applies. A missing confirm asks again. It is not "Not authorized".
 */
async function requireAdminDecision(contextUserId: string) {
  const { getViewAsFrame, runWithoutViewAs } = await import("@/lib/server/view-as-frame.server");
  const { getVerifiedAuthSession } = await import("@/lib/auth/verify.server");
  const real = await runWithoutViewAs(() => getVerifiedAuthSession());
  const actorId = real?.id || contextUserId;
  const { adminMayDecideCentre } = await import("@/lib/admin-decision-auth");
  const sql = await getSql();
  const roleRows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${actorId} limit 1
  `;
  if (
    real?.email &&
    roleRows[0] &&
    !adminMayDecideCentre({ email: real.email, storedRole: roleRows[0].role })
  ) {
    throw new Error("Not authorized");
  }
  const frame = getViewAsFrame();
  if (frame && frame.actorUserId === actorId) {
    throw new Error("View as user is read-only.");
  }
  const actor = await requireAdmin(actorId);
  const { assertRecentReauth } = await import("@/lib/server/reauth.server");
  assertRecentReauth(actorId);
  return { ...actor, userId: actorId };
}

async function deliverToProvider(to: string, subject: string, text: string, aboutTestListing = false) {
  if (aboutTestListing) {
    console.info("[kidease-mail] provider-decision skipped test listing", subject);
    return "logged";
  }
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
  const { prepareMailBody } = await import("@/lib/transactional-mail");
  const { brandedNotice } = await import("@/lib/email-layout");
  const prepared = await prepareMailBody({
    purpose: "claim",
    to,
    subject,
    text,
    html,
    branded: brandedNotice({
      heading: subject,
      text,
      cta: { label: "Open your dashboard", href: "https://kidease.ca/provider" },
    }),
  });
  const gated = await gateOutboundEmail({ to, subject, label: "centre-decision" });
  if (!gated.allow) return "logged";
  to = gated.to;
  subject = gated.subject;
  const sendText = prepared.text;
  const sendHtml = prepared.html;
  const headers = Object.keys(prepared.headers).length ? prepared.headers : undefined;
  const from = transactionalMailFrom();
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: ADMIN_EMAIL,
        subject,
        text: sendText,
        html: sendHtml,
        ...(headers ? { headers } : {}),
        tags: resendCampaignTags("centre-decision"),
      }),
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
        ...(headers ? { headers } : {}),
        content: [
          { type: "text/plain", value: sendText },
          { type: "text/html", value: sendHtml },
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
  if (decision === "needs_docs") {
    return {
      subject: `${name} needs a document before KidEase can approve it`,
      text: `Hi,\n\nWe reviewed the claim for ${name}. It is not live yet.\nPlease reply with the missing document (licence, screening, or first aid) and we will take another look.\n\nYou can still open the provider dashboard: https://kidease.ca/provider`,
    };
  }
  if (decision === "approve") {
    return {
      subject: `${name} is live on KidEase`,
      text: `Hi,\n\nYour listing for ${name} has been approved and is now live on KidEase.\nParents can find you in search, request a spot, and message you in-app.\n\nOpen your dashboard: https://kidease.ca/provider\n\nIf anything on the listing needs a correction, reply to this email or update it from the provider dashboard.`,
    };
  }
  if (decision === "decline") {
    return {
      subject: `Update on ${name}: KidEase listing`,
      text: `Hi,\n\nWe reviewed the claim for ${name} and are not able to publish it on KidEase at this time.\nThe listing is not live for parent requests.\n\nIf you think this is a mistake, or you have a licence document to send, reply to this email and we will take another look.`,
    };
  }
  return {
    subject: `${name} is in review at KidEase`,
    text: `Hi,\n\nYour listing for ${name} is on the KidEase review list.\nIt is not live for parent requests yet. We will email you as soon as it is approved or if we need anything else.\n\nYou can still open the provider dashboard: https://kidease.ca/provider`,
  };
}

async function loadAdminAddonLines(sql: Awaited<ReturnType<typeof getSql>>, daycareIds: string[]) {
  const out = new Map<string, string>();
  const ids = [...new Set(daycareIds.filter(Boolean))];
  if (!ids.length) return out;
  const rows = await sql.query<{
    daycare_id: string;
    featured: boolean;
    claim_until: string | null;
    claim_pending: boolean;
    job_credits: number | null;
    job_posts: number | null;
  }>(
    `select d.id as daycare_id,
        bool_or(
          pr.featured_city_status in ('active', 'trialing', 'past_due')
          and position('featured_city' in coalesce(pr.selected_addons, '')) > 0
          and (pr.featured_city_centre_id is null or pr.featured_city_centre_id = d.id)
        ) as featured,
        max(d.priority_until)::text as claim_until,
        bool_or(
          pr.claim_boost_paid_at is not null
          and pr.claim_boost_applied_at is null
          and (pr.claim_boost_centre_id is null or pr.claim_boost_centre_id = d.id)
        ) as claim_pending,
        max(
          case
            when exists (select 1 from centre_job_credits c where c.user_id = pr.user_id) then (
              select count(*)::int from centre_job_credits c
              where c.user_id = pr.user_id
                and c.spent_at is null
                and (c.daycare_id is null or c.daycare_id = d.id)
            )
            when pr.job_post_centre_id is null or pr.job_post_centre_id = d.id then pr.job_post_credits
            else 0
          end
        ) as job_credits,
        (select count(*)::int from centre_job_posts j where j.daycare_id = d.id) as job_posts
      from daycares d
      join provider_daycares pd on pd.daycare_id = d.id
      join profiles pr on pr.user_id = pd.user_id
      where d.id = any($1::text[])
      group by d.id`,
    [ids],
  );
  for (const row of rows) {
    const line = adminAddonLine({
      featured: Boolean(row.featured),
      claimUntil: row.claim_until,
      claimPending: Boolean(row.claim_pending),
      jobCredits: Number(row.job_credits) || 0,
      jobPosts: Number(row.job_posts) || 0,
    });
    if (line) out.set(row.daycare_id, line);
  }
  return out;
}

export const listAdminCentres = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireOperator(context.userId);
    const rows = await readAdminCentreQueueRows();
    const sql = await getSql();
    const addonByCentre = await loadAdminAddonLines(sql, rows.map((row) => row.daycareId));
    return rows.map((row) => ({ ...row, addonLine: addonByCentre.get(row.daycareId) ?? null }));
  });

/** Incomplete / Needs-complete slice — same rows as listAdminCentres, filtered in-process. */
export function listIncompleteAdminCentres(rows: AdminCentreRow[]): AdminCentreRow[] {
  return selectIncompleteRows(rows.filter((row) => !row.mergedInto && !row.importFault)).sort(
    (a, b) => compareTimeDesc(a.updatedAt || a.submittedAt, b.updatedAt || b.submittedAt) || a.name.localeCompare(b.name),
  );
}

export const decideCentre = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; decision: Decision; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireAdminDecision(context.userId);
    const decision = data.decision;
    if (!["approve", "decline", "waiting", "needs_docs"].includes(decision)) throw new Error("Invalid decision");

    const sql = await getSql();
    const listed = await sql<{
      id: string;
      slug: string;
      name: string;
      address: string;
      city: string;
      province: string;
      contact_email: string | null;
      visibility: string | null;
      is_test: number | null;
    }>`
      select id, slug, name, address, city, province, contact_email, visibility, is_test
      from daycares where id = ${data.daycareId} limit 1
    `;
    const centre = listed[0];
    if (!centre) throw new Error("Centre not found");

    let claimStatus = decision === "decline" ? "declined" : "waiting";
    let approvalHealth: Awaited<ReturnType<typeof runApproval>>["health"] | null = null;

    if (decision === "approve") {
      // Approve needs the public-card minimum: 1 photo, a valid licence, fees and ages.
      // The score can be under Ready (Kyle can override); the minimum cannot.
      const minimum = await loadDaycareHealth(sql, data.daycareId);
      if (!minimum.minimumMet) {
        throw new Error(`Not approved yet: ${minimum.blockers.map((b) => b.en).join(". ")}.`);
      }
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
      order by case
        when status in ('waiting', 'pending', 'verified') then 0
        when status = 'approved' then 1
        else 2
      end, created_at desc
      limit 1
    `;
    if (latest[0] && decision !== "approve") {
      await sql`
        update listing_claims
        set status = ${claimStatus},
            reviewed_at = now(),
            reviewed_by = ${actor.userId},
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
      mail = await deliverToProvider(to, copy.subject, copy.text, isAdminOnlyListing({ name: centre.name, slug: centre.slug, visibility: centre.visibility, isTest: centre.is_test }));
    } catch (err) {
      mail = "failed";
      console.error("[kidease-mail] decision notify failed", err);
    }

    try {
      const { notifyClaimDecision } = await import("@/lib/server/wiring/claim-notices");
      await notifyClaimDecision({
        decision,
        daycareId: centre.id,
        daycareUserId: latest[0]?.user_id || null,
        province: centre.province,
        centreName: centre.name,
      });
    } catch {
      console.error("[kidease-claim-notice] skipped");
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
              : decision === "needs_docs"
                ? `Needs a document: ${centre.name}`
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

    if (decision === "needs_docs" && latest[0]?.user_id) {
      const claimantId = latest[0].user_id;
      void import("@/lib/server/alert-fanout")
        .then((mod) =>
          mod.notifyClaimNeedsDocument({
            userId: claimantId,
            daycareId: data.daycareId,
            daycareName: centre.name,
            emailFallback: mail !== "sent",
          }),
        )
        .catch(() => undefined);
    }

    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: actor.userId,
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

/** Put a retired duplicate back on its own slug. Does not delete either row. */
export const unmergeCentre = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const daycareId = data.daycareId.trim();
    if (!daycareId) throw new Error("Listing not found");
    const sql = await getSql();
    const updated = await sql<{ id: string; name: string }>`
      update daycares
      set merged_into = null,
          listing_active = 1,
          claim_status = case
            when claim_status = 'superseded' and claimed_at is null then 'unclaimed'
            else claim_status
          end
      where id = ${daycareId}
        and merged_into is not null
      returning id, name
    `;
    const row = updated[0];
    if (!row) throw new Error("This listing is not merged");
    const { resetNeonCatalogCache } = await import("@/lib/server/catalog-neon");
    resetNeonCatalogCache();
    await writeTrustEvent(sql, {
      daycareId,
      actorUserId: context.userId,
      kind: "unmerge",
      note: `${actor.name || "Operator"} un-merged ${row.name}`,
    });
    return { ok: true as const, daycareId };
  });

/** Put a possible-second-site row back on the public catalogue. Does not delete it. */
export const restoreHiddenReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const daycareId = data.daycareId.trim();
    if (!daycareId) throw new Error("Listing not found");
    const sql = await getSql();
    const updated = await sql<{ id: string; name: string }>`
      update daycares
      set import_fault = null,
          review_of = null,
          listing_active = 1,
          visibility = 'public'
      where id = ${daycareId}
        and import_fault = ${HIDDEN_REVIEW_POSSIBLE_SECOND_SITE}
        and merged_into is null
      returning id, name
    `;
    const row = updated[0];
    if (!row) throw new Error("This listing is not a hidden second site");
    const { resetNeonCatalogCache } = await import("@/lib/server/catalog-neon");
    resetNeonCatalogCache();
    await writeTrustEvent(sql, {
      daycareId,
      actorUserId: context.userId,
      kind: "restore_hidden_review",
      note: `${actor.name || "Operator"} restored ${row.name}`,
    });
    return { ok: true as const, daycareId };
  });

/** Merge a hidden possible-second-site row into the live sibling. The row stays. */
export const mergeHiddenReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const daycareId = data.daycareId.trim();
    if (!daycareId) throw new Error("Listing not found");
    const sql = await getSql();
    const updated = await sql<{ id: string; name: string; merged_into: string }>`
      update daycares
      set merged_into = review_of,
          import_fault = null,
          listing_active = 0,
          claim_status = 'superseded',
          visibility = 'admin_only'
      where id = ${daycareId}
        and import_fault = ${HIDDEN_REVIEW_POSSIBLE_SECOND_SITE}
        and review_of is not null
        and merged_into is null
        and exists (
          select 1 from daycares live
          where live.id = daycares.review_of
            and live.id <> daycares.id
        )
      returning id, name, merged_into
    `;
    const row = updated[0];
    if (!row) throw new Error("This listing is not a hidden second site");
    const { resetNeonCatalogCache } = await import("@/lib/server/catalog-neon");
    resetNeonCatalogCache();
    await writeTrustEvent(sql, {
      daycareId,
      actorUserId: context.userId,
      kind: "merge_hidden_review",
      note: `${actor.name || "Operator"} merged ${row.name} into ${row.merged_into}`,
    });
    return { ok: true as const, daycareId, mergedInto: row.merged_into };
  });
