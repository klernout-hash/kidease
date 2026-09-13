import { getSql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { sendProviderNextStepsMail } from "@/lib/server/provider-onboard-mail";
import {
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

/**
 * Actor mail after a new parent / provider account.
 * Runs even when Admin SMS/email failed — never gated on adminStatus === "sent".
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
  if (shouldSendProviderNextSteps({ role, email: actor.email, emailVerified: actor.emailVerified })) {
    try {
      await sendProviderNextStepsMail({ to: actor.email! });
    } catch (err) {
      console.error("[kidease-mail] provider next-steps failed", err);
    }
  }
}

/** After Better Auth marks the mailbox verified — send provider next-steps if this is a daycare account. */
export async function sendProviderNextStepsIfReady(userId: string) {
  const actor = await lookupUser(userId);
  const role = (await profileRole(userId)) === "provider" ? "provider" : "parent";
  if (!shouldSendProviderNextSteps({ role, email: actor.email, emailVerified: true })) return;
  try {
    await sendProviderNextStepsMail({ to: actor.email! });
  } catch (err) {
    console.error("[kidease-mail] provider next-steps after verify failed", err);
  }
}
