/**
 * One send path for automation mail.
 * Dry-run logs and stores status dry_run. Live upgrades that row and sends.
 * A sent row is never sent again (idempotent).
 * Quiet hours hold without writing a row, so the next run can send.
 * This file does not touch subscription checkout or Apple/Google IAP.
 */

import { getSql } from "@/lib/db";
import {
  AUTOMATION_WEEKLY_CAP,
  emailBlocked,
  isCommercialAutomation,
  recipientAllowed,
  weeklyCapAllows,
  type AutomationLocale,
  type AutomationMode,
  type EmailBlockReason,
} from "@/lib/automations";
import { normalizeCaslEmail } from "@/lib/casl";

export type DispatchResult =
  | "sent"
  | "dry_run"
  | "duplicate"
  | "quiet"
  | "weekly_cap"
  | "suppressed"
  | "allowlist"
  | "invalid"
  | "failed";

async function suppressionOf(email: string): Promise<{ ok: boolean; reason: EmailBlockReason }> {
  try {
    const sql = await getSql();
    const rows = await sql<{ reason: string | null }>`
      select reason from email_suppressions where email = ${email} limit 1
    `;
    const reason = String(rows[0]?.reason || "").trim().toLowerCase();
    if (!rows[0]) return { ok: true, reason: null };
    if (reason === "bounce" || reason === "complaint" || reason === "unsubscribe" || reason === "manual") {
      return { ok: true, reason };
    }
    return { ok: true, reason: "manual" };
  } catch {
    return { ok: false, reason: null };
  }
}

async function commercialSentThisWeek(email: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n
    from automation_sends
    where recipient = ${email}
      and channel = 'email'
      and status = 'sent'
      and created_at > now() - interval '7 days'
      and automation in (
        'missing_info_centre',
        'missing_info_parent',
        'daycare_onboarding',
        'claim_listing',
        'stale_spot_reminder',
        'tour_followup',
        'enrolment_review'
      )
  `.catch(() => [] as { n: number }[]);
  return Number(rows[0]?.n) || 0;
}

export async function dispatchAutomationMail(input: {
  automation: string;
  dedupeKey: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
  mode: AutomationMode;
  quiet: boolean;
  allowlist: string[] | null;
  /** Ops pages ignore the test allowlist so a failure still reaches Kyle. */
  exemptAllowlist?: boolean;
}): Promise<DispatchResult> {
  if (input.mode === "off") return "invalid";
  const recipient = normalizeCaslEmail(input.recipient);
  if (!recipient) return "invalid";
  const commercial = isCommercialAutomation(input.automation);
  if (!input.exemptAllowlist && !recipientAllowed(recipient, input.allowlist)) return "allowlist";
  if (input.quiet) return "quiet";

  const suppression = await suppressionOf(recipient);
  if (!suppression.ok && commercial) return "suppressed";
  if (
    emailBlocked({
      suppressed: suppression.reason != null,
      reason: suppression.reason,
      commercial,
    })
  ) {
    return "suppressed";
  }
  if (commercial && !weeklyCapAllows(await commercialSentThisWeek(recipient), AUTOMATION_WEEKLY_CAP)) {
    return "weekly_cap";
  }

  const sql = await getSql();
  const status = input.mode === "dry_run" ? "dry_run" : "pending";
  const inserted = await sql<{ dedupe_key: string }>`
    insert into automation_sends (automation, dedupe_key, channel, recipient, status)
    values (${input.automation}, ${input.dedupeKey}, 'email', ${recipient}, ${status})
    on conflict (automation, dedupe_key, channel) do nothing
    returning dedupe_key
  `.catch(() => [] as { dedupe_key: string }[]);

  if (!inserted[0]) {
    const existing = await sql<{ status: string }>`
      select status from automation_sends
      where automation = ${input.automation}
        and dedupe_key = ${input.dedupeKey}
        and channel = 'email'
      limit 1
    `.catch(() => [] as { status: string }[]);
    const prior = existing[0]?.status || "sent";
    if (prior === "sent") return "duplicate";
    if (prior === "dry_run" && input.mode === "dry_run") return "duplicate";
    if (prior === "dry_run" && input.mode === "live") {
      const upgraded = await sql<{ dedupe_key: string }>`
        update automation_sends
        set status = 'pending', recipient = ${recipient}
        where automation = ${input.automation}
          and dedupe_key = ${input.dedupeKey}
          and channel = 'email'
          and status = 'dry_run'
        returning dedupe_key
      `.catch(() => [] as { dedupe_key: string }[]);
      if (!upgraded[0]) return "duplicate";
    } else if (prior === "pending" && input.mode === "dry_run") {
      return "duplicate";
    } else if (prior !== "pending") {
      return "duplicate";
    }
  }

  if (input.mode === "dry_run") {
    console.info(
      "[kidease-automation] dry-run",
      JSON.stringify({
        automation: input.automation,
        dedupeKey: input.dedupeKey,
        recipient,
        subject: input.subject.slice(0, 120),
      }),
    );
    return "dry_run";
  }

  try {
    const { sendTransactionalMail } = await import("@/lib/transactional-mail");
    await sendTransactionalMail({
      purpose: "customer_alert",
      to: recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    await sql`
      update automation_sends
      set status = 'sent'
      where automation = ${input.automation}
        and dedupe_key = ${input.dedupeKey}
        and channel = 'email'
    `;
    return "sent";
  } catch {
    await sql`
      delete from automation_sends
      where automation = ${input.automation}
        and dedupe_key = ${input.dedupeKey}
        and channel = 'email'
        and status = 'pending'
    `.catch(() => undefined);
    return "failed";
  }
}

export type Letter = { subject: string; text: string; html: string };

export function letterLocale(raw: unknown): AutomationLocale {
  return String(raw || "").toLowerCase().startsWith("fr") ? "fr" : "en";
}
