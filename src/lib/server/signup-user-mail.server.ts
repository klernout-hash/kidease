import { getSql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { sendProviderNextStepsMail } from "@/lib/server/provider-onboard-mail";
import { claimActorMailOnce, releaseActorMailOnce } from "@/lib/server/actor-mail-dedupe";
import {
  PROVIDER_ONBOARD_PURPOSE,
  VERIFY_EMAIL_NUDGE_PURPOSE,
  listingDisplayName,
  shouldSendProviderNextSteps,
  shouldSendVerifyEmail,
  shouldSendVerifyNudge,
  signupSendsNextSteps,
  signupUserMailIndependentOfAdmin,
} from "@/lib/signup-user-mail";

export { signupSendsNextSteps, signupUserMailIndependentOfAdmin };

async function profileRole(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.role ?? null;
}

async function lookupProviderListingName(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ name: string | null }>`
    select d.name
    from provider_daycares p
    join daycares d on d.id = p.daycare_id
    where p.user_id = ${userId}
    order by d.created_at desc
    limit 1
  `.catch(() => []);
  return listingDisplayName(rows[0]?.name) || null;
}

async function requestVerificationEmail(email: string) {
  const { auth } = await import("@/lib/auth/server");
  let headers: Headers | undefined;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    headers = getRequest()?.headers;
  } catch {
    headers = undefined;
  }
  await auth.api.sendVerificationEmail({
    body: { email, callbackURL: "/" },
    ...(headers ? { headers } : {}),
  });
}

async function sendNextStepsOnce(input: {
  userId: string;
  email: string;
  name?: string | null;
  listingName?: string | null;
}) {
  const claimed = await claimActorMailOnce({
    purpose: PROVIDER_ONBOARD_PURPOSE,
    email: input.email,
    userId: input.userId,
  });
  if (!claimed) return { status: "skipped" as const };
  try {
    await sendProviderNextStepsMail({
      to: input.email,
      name: input.name,
      listingName: input.listingName,
    });
    return { status: "sent" as const };
  } catch (err) {
    await releaseActorMailOnce({ purpose: PROVIDER_ONBOARD_PURPOSE, email: input.email });
    throw err;
  }
}

/**
 * Actor mail after a new parent / provider account.
 * Runs even when Admin SMS/email failed — never gated on adminStatus === "sent".
 * Signup sends verify-your-email only. Next-steps wait for emailVerified
 * (or fire now when this mailbox is already verified, e.g. Google).
 */
export async function afterNewAccountUserMail(userId: string, role: "parent" | "provider") {
  signupUserMailIndependentOfAdmin();
  signupSendsNextSteps();
  const actor = await lookupUser(userId);
  if (shouldSendVerifyEmail(actor) && actor.email) {
    try {
      await requestVerificationEmail(actor.email);
    } catch (err) {
      console.error("[kidease-mail] verify-email backup failed", err);
    }
  }
  if (shouldSendProviderNextSteps({ role, email: actor.email, emailVerified: actor.emailVerified })) {
    try {
      const listingName = await lookupProviderListingName(userId);
      await sendNextStepsOnce({ userId, email: actor.email!, name: actor.name, listingName });
    } catch (err) {
      console.error("[kidease-mail] provider next-steps failed", err);
    }
  }
}

/** After emailVerified (or already-verified provider). Once-ever, not at signup. */
export async function sendProviderNextStepsIfReady(userId: string, roleHint?: "parent" | "provider") {
  const actor = await lookupUser(userId);
  const role =
    roleHint === "provider" || roleHint === "parent"
      ? roleHint
      : (await profileRole(userId)) === "provider"
        ? "provider"
        : "parent";
  if (!shouldSendProviderNextSteps({ role, email: actor.email, emailVerified: actor.emailVerified })) {
    return { status: "skipped" as const };
  }
  try {
    const listingName = await lookupProviderListingName(userId);
    return await sendNextStepsOnce({ userId, email: actor.email!, name: actor.name, listingName });
  } catch (err) {
    console.error("[kidease-mail] provider next-steps failed", err);
    return { status: "failed" as const };
  }
}

/** Daily digest cron: one verify-only resend if still unverified after 24–48h. */
export async function runVerifyEmailNudgeJob(now: Date = new Date()) {
  const sql = await getSql();
  const olderThan = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const newerThan = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rows = await sql
    .query<{ id: string; email: string | null; name: string | null; createdAt: Date | string; emailVerified: boolean | null }>(
      `select id, email, name, "createdAt", "emailVerified" from "user"
       where coalesce("emailVerified", false) = false
         and email is not null
         and "createdAt" <= $1
         and "createdAt" > $2
       order by "createdAt" asc
       limit 80`,
      [olderThan.toISOString(), newerThan.toISOString()],
    )
    .catch(
      () =>
        [] as {
          id: string;
          email: string | null;
          name: string | null;
          createdAt: Date | string;
          emailVerified: boolean | null;
        }[],
    );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (
      !shouldSendVerifyNudge({
        email: row.email,
        emailVerified: row.emailVerified,
        createdAt: row.createdAt,
        now,
      })
    ) {
      skipped += 1;
      continue;
    }
    const email = (row.email || "").trim().toLowerCase();
    const claimed = await claimActorMailOnce({
      purpose: VERIFY_EMAIL_NUDGE_PURPOSE,
      email,
      userId: row.id,
    });
    if (!claimed) {
      skipped += 1;
      continue;
    }
    try {
      await requestVerificationEmail(email);
      sent += 1;
    } catch (err) {
      failed += 1;
      await releaseActorMailOnce({ purpose: VERIFY_EMAIL_NUDGE_PURPOSE, email });
      console.error("[kidease-mail] verify-email nudge failed", err);
    }
  }
  return { ok: true as const, sent, skipped, failed, scanned: rows.length };
}
