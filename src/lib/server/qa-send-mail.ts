/**
 * The only send path for ADM-08, ADM-11, ADM-19, ADM-23, and MSG-03.
 * Titan mailbox on kidease.ca. A recipient who is not on QA_SEND_ALLOWLIST is logged and dropped.
 */
import { getSql } from "@/lib/db";
import { parseQaAllowlist, qaSendDecision, type QaSendDecision, type QaSendFeature } from "@/lib/qa-send";
import { mailboxAddress } from "@/lib/server/titan-mail";

export function qaAllowlistFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseQaAllowlist(env.QA_SEND_ALLOWLIST);
}

export function qaSendSince(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = String(env.QA_SEND_SINCE || "").trim();
  return raw || null;
}

export async function deliverQaEmail(input: {
  feature: QaSendFeature;
  recipient: string;
  subject: string;
  text: string;
  html?: string;
  occurredAt: string;
  alreadySent?: boolean;
  dedupeKey?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<QaSendDecision & { via: "titan" | "none" }> {
  const env = input.env ?? process.env;
  const sender = mailboxAddress(env);
  let alreadySent = input.alreadySent === true;
  const dedupeKey = String(input.dedupeKey || "").trim();
  if (!alreadySent && dedupeKey) {
    const sql = await getSql();
    const prior = await sql<{ status: string }>`
      select status from automation_sends
      where automation = ${input.feature}
        and dedupe_key = ${dedupeKey}
        and channel = 'email'
      limit 1
    `.catch(() => [] as { status: string }[]);
    alreadySent = prior[0]?.status === "sent";
  }
  const decision = qaSendDecision({
    feature: input.feature,
    channel: "email",
    recipient: input.recipient,
    sender,
    occurredAt: input.occurredAt,
    enabledAt: qaSendSince(env),
    alreadySent,
    allowlist: qaAllowlistFromEnv(env),
  });
  const line = {
    feature: decision.feature,
    reason: decision.reason,
    recipient: input.recipient.trim().toLowerCase(),
    sender,
    via: decision.deliver ? "titan" : "none",
  };
  if (!decision.deliver) {
    console.info("[kidease-qa-send]", JSON.stringify(line));
    return { ...decision, via: "none" };
  }
  const { sendTitanMail } = await import("@/lib/server/titan-mail.server");
  await sendTitanMail({
    to: input.recipient.trim(),
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (dedupeKey) {
    const sql = await getSql();
    await sql`
      insert into automation_sends (automation, dedupe_key, channel, recipient, status)
      values (${input.feature}, ${dedupeKey}, 'email', ${input.recipient.trim().toLowerCase()}, 'sent')
      on conflict (automation, dedupe_key, channel) do update set status = 'sent'
    `.catch(() => undefined);
  }
  console.info("[kidease-qa-send]", JSON.stringify(line));
  return { ...decision, via: "titan" };
}
