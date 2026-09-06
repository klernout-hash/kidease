import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, lookupUser, notifyPlatform } from "@/lib/server/notify";
import { notifyClaimStatusSms } from "@/lib/server/sms";
import { requireAdmin } from "@/lib/server/roles";
import { writeTrustEvent } from "@/lib/server/trust";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

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
};

export type Decision = "approve" | "decline" | "waiting";

async function requireOperator(userId: string) {
  return requireAdmin(userId);
}

function normalizeStatus(claimStatus: string | null, claimedAt: string | null, claimRow: string | null) {
  if (claimStatus === "approved" || (claimedAt && claimStatus !== "declined" && claimStatus !== "waiting" && claimStatus !== "pending")) {
    return "approved";
  }
  if (claimStatus === "declined" || claimRow === "declined") return "declined";
  if (claimStatus === "waiting" || claimRow === "waiting" || claimRow === "verified") return "waiting";
  if (claimStatus === "pending" || claimRow === "pending") return "pending";
  if (claimedAt) return "approved";
  return claimStatus || "unclaimed";
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
  const from = (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();
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
    const rows = await sql<{
      daycare_id: string;
      slug: string;
      name: string;
      address: string;
      city: string;
      province: string;
      phone: string | null;
      contact_email: string | null;
      claim_status: string | null;
      claimed_at: string | null;
      claim_id: string | null;
      claim_row_status: string | null;
      provider_user_id: string | null;
      provider_name: string | null;
      provider_email: string | null;
      submitted_at: string | null;
      reviewed_at: string | null;
      review_note: string | null;
      license_number: string | null;
      license_status: string | null;
      license_expiry: string | null;
      licensed_capacity: number | null;
      registry_match_state: string | null;
      license_verified_at: string | null;
      license_verification_source: string | null;
      staff_screening_attested: number | boolean | null;
      staff_screening_attested_at: string | null;
    }>`
      select distinct on (d.id)
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
        u.name as provider_name,
        u.email as provider_email,
        coalesce(c.created_at, d.claimed_at) as submitted_at,
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
        d.staff_screening_attested_at
      from daycares d
      left join listing_claims c on c.daycare_id = d.id
      left join provider_daycares pd on pd.daycare_id = d.id
      left join "user" u on u.id = coalesce(c.user_id, pd.user_id)
      where d.claimed_at is not null
         or d.claim_status in ('pending', 'waiting', 'verified', 'approved', 'declined')
         or c.id is not null
         or pd.user_id is not null
         or d.slug = 'test-ghost-claim-lab'
         or d.license_number = 'TEST-GHOST-0001'
         or d.id = 'ke-test-ghost-001'
      order by d.id, c.created_at desc nulls last
    `.catch(() =>
      sql<{
        daycare_id: string;
        slug: string;
        name: string;
        address: string;
        city: string;
        province: string;
        phone: string | null;
        contact_email: string | null;
        claim_status: string | null;
        claimed_at: string | null;
        claim_id: string | null;
        claim_row_status: string | null;
        provider_user_id: string | null;
        provider_name: string | null;
        provider_email: string | null;
        submitted_at: string | null;
        reviewed_at: string | null;
        review_note: string | null;
        license_number: string | null;
        license_status: string | null;
        license_expiry: string | null;
        licensed_capacity: number | null;
        registry_match_state: string | null;
        license_verified_at: string | null;
        license_verification_source: string | null;
        staff_screening_attested: number | boolean | null;
        staff_screening_attested_at: string | null;
      }>`
        select distinct on (d.id)
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
          u.name as provider_name,
          u.email as provider_email,
          coalesce(c.created_at, d.claimed_at) as submitted_at,
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
          null::timestamptz as staff_screening_attested_at
        from daycares d
        left join listing_claims c on c.daycare_id = d.id
        left join provider_daycares pd on pd.daycare_id = d.id
        left join "user" u on u.id = coalesce(c.user_id, pd.user_id)
        where d.claimed_at is not null
           or d.claim_status in ('pending', 'waiting', 'verified', 'approved', 'declined')
           or c.id is not null
           or pd.user_id is not null
           or d.slug = 'test-ghost-claim-lab'
           or d.license_number = 'TEST-GHOST-0001'
           or d.id = 'ke-test-ghost-001'
        order by d.id, c.created_at desc nulls last
      `.catch(() => []),
    );

    const mapped: AdminCentreRow[] = rows.map((r) => {
      const status = normalizeStatus(r.claim_status, r.claimed_at, r.claim_row_status);
      return {
        daycareId: r.daycare_id,
        slug: r.slug,
        name: r.name,
        address: r.address,
        city: r.city,
        province: r.province,
        phone: r.phone,
        contactEmail: r.contact_email,
        claimStatus: status,
        claimedAt: r.claimed_at,
        live: status === "approved",
        claimId: r.claim_id,
        claimRowStatus: r.claim_row_status,
        providerUserId: r.provider_user_id,
        providerName: r.provider_name,
        providerEmail: r.provider_email,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
        reviewNote: r.review_note,
        licenseNumber: r.license_number,
        licenseStatus: r.license_status || "unverified",
        licenseExpiry: r.license_expiry,
        licensedCapacity: r.licensed_capacity,
        registryMatchState: r.registry_match_state || "unmatched",
        licenseVerifiedAt: r.license_verified_at,
        licenseVerificationSource: r.license_verification_source,
        staffScreeningAttested: r.staff_screening_attested === 1 || r.staff_screening_attested === true,
        staffScreeningAttestedAt: r.staff_screening_attested_at,
      };
    });

    const rank = (s: string) => (s === "waiting" || s === "pending" ? 0 : s === "approved" ? 1 : 2);
    mapped.sort((a, b) => rank(a.claimStatus) - rank(b.claimStatus) || (b.submittedAt || "").localeCompare(a.submittedAt || "") || a.name.localeCompare(b.name));
    return mapped;
  });

export const decideCentre = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; decision: Decision; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
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

    const claimStatus = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "waiting";
    const claimRowStatus = claimStatus;

    if (decision === "approve") {
      await sql`
        update daycares
        set claimed_at = coalesce(claimed_at, now()),
            claim_status = ${claimStatus},
            verified = 1
        where id = ${data.daycareId}
      `;
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
      order by created_at desc limit 1
    `;
    if (latest[0]) {
      await sql`
        update listing_claims
        set status = ${claimRowStatus},
            reviewed_at = now(),
            reviewed_by = ${context.userId},
            review_note = ${data.note?.trim() || null}
        where id = ${latest[0].id}
      `.catch(async () => {
        await sql`
          update listing_claims
          set status = ${claimRowStatus}
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
      await notifyClaimStatusSms({
        to: phoneRows[0]?.phone,
        centreName: centre.name,
        status: claimStatus,
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
      payload: JSON.stringify({ decision, claimStatus, mailed: mail }),
    });

    return { ok: true as const, status: claimStatus, mailed: mail, to: to || null };
  });
