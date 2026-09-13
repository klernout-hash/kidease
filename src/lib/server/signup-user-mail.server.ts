import { getSql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { sendProviderNextStepsMail } from "@/lib/server/provider-onboard-mail";
import { claimActorMailDay, releaseActorMailDay } from "@/lib/server/actor-mail-dedupe";
import {
  PROVIDER_ONBOARD_PURPOSE,
  shouldSendProviderNextSteps,
  shouldSendVerifyEmail,
  signupUserMailIndependentOfAdmin,
} from "@/lib/signup-user-mail";

export { signupUserMailIndependentOfAdmin };

async function profileRole(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.role ?? null;
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

async function sendNextStepsOnceToday(input: {
  userId: string;
  email: string;
  name?: string | null;
}) {
  const claimed = await claimActorMailDay({
    purpose: PROVIDER_ONBOARD_PURPOSE,
    email: input.email,
    userId: input.userId,
  });
  if (!claimed) return { status: "skipped" as const };
  try {
    await sendProviderNextStepsMail({ to: input.email, name: input.name });
    return { status: "sent" as const };
  } catch (err) {
    await releaseActorMailDay({ purpose: PROVIDER_ONBOARD_PURPOSE, email: input.email });
    throw err;
  }
}

/**
 * Actor mail after a new parent / provider account.
 * Runs even when Admin SMS/email failed — never gated on adminStatus === "sent".
 * Next-steps fire on provider signup (same-day dedupe vs first listing).
 */
export async function afterNewAccountUserMail(userId: string, role: "parent" | "provider") {
  signupUserMailIndependentOfAdmin();
  const actor = await lookupUser(userId);
  if (shouldSendVerifyEmail(actor) && actor.email) {
    try {
      await requestVerificationEmail(actor.email);
    } catch (err) {
      console.error("[kidease-mail] verify-email backup failed", err);
    }
  }
  if (shouldSendProviderNextSteps({ role, email: actor.email })) {
    try {
      await sendNextStepsOnceToday({ userId, email: actor.email!, name: actor.name });
    } catch (err) {
      console.error("[kidease-mail] provider next-steps failed", err);
    }
  }
}

/** Provider signup or first listing — same-day Winnipeg dedupe. */
export async function sendProviderNextStepsIfReady(userId: string, roleHint?: "parent" | "provider") {
  const actor = await lookupUser(userId);
  const role =
    roleHint === "provider" || roleHint === "parent"
      ? roleHint
      : (await profileRole(userId)) === "provider"
        ? "provider"
        : "parent";
  if (!shouldSendProviderNextSteps({ role, email: actor.email })) return { status: "skipped" as const };
  try {
    return await sendNextStepsOnceToday({ userId, email: actor.email!, name: actor.name });
  } catch (err) {
    console.error("[kidease-mail] provider next-steps failed", err);
    return { status: "failed" as const };
  }
}
