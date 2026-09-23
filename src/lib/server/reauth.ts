import { createServerFn } from "@tanstack/react-start";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { adminReauthGraceMs, REAUTH_REQUIRED_MESSAGE, REAUTH_WINDOW_MS } from "@/lib/reauth";
import { startTwoFactor } from "@/lib/server/two-factor";

export { REAUTH_REQUIRED_MESSAGE, REAUTH_WINDOW_MS };

export const getReauthStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { isCurrentUserRecentlyReauthed } = await import("./reauth.server");
    return {
      ok: isCurrentUserRecentlyReauthed(context.userId),
      windowMs: REAUTH_WINDOW_MS,
      graceMs: adminReauthGraceMs(process.env.ADMIN_REAUTH_GRACE_MS),
    };
  });

/**
 * Soft session-continue into Admin is only OK when the idle cookie is still
 * fresh (or a brand-new session can mint it). Otherwise require password again.
 */
export const canContinueAdminSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { bootstrapAdminIdleFromSession } = await import("./reauth.server");
    const ok = await bootstrapAdminIdleFromSession(context.userId);
    return { ok };
  });

export const confirmReauthPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { password: string; turnstileToken?: string }) => ({
    password: String(input?.password || ""),
    turnstileToken: String(input?.turnstileToken || ""),
  }))
  .handler(async ({ context, data }) => {
    const { assertTurnstileToken } = await import("./turnstile");
    await assertTurnstileToken(data.turnstileToken);
    if (!data.password) throw new Error("Enter your current password.");
    const ok = await verifyUserPassword(context.userId, data.password);
    if (!ok) throw new Error("That password is not correct.");
    const { markAdminIdleFresh, writeReauthCookie } = await import("./reauth.server");
    writeReauthCookie(context.userId);
    await markAdminIdleFresh(context.userId);
    return { ok: true as const };
  });

export const startReauthOtp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    return startTwoFactor({ data: { force: true } });
  });

export const confirmReauthOtp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string; turnstileToken?: string }) => ({
    code: String(input?.code || "").replace(/\D/g, "").slice(0, 6),
    turnstileToken: String(input?.turnstileToken || ""),
  }))
  .handler(async ({ context, data }) => {
    const { assertTurnstileToken } = await import("./turnstile");
    await assertTurnstileToken(data.turnstileToken);
    if (data.code.length !== 6) throw new Error("Enter the 6-digit code from your email.");
    const { consumeTwoFactorCode } = await import("./two-factor");
    await consumeTwoFactorCode(context.userId, data.code);
    const { markAdminIdleFresh, writeReauthCookie } = await import("./reauth.server");
    const { writeTwoFactorSessionCookie } = await import("./two-factor.server");
    writeTwoFactorSessionCookie(context.userId);
    writeReauthCookie(context.userId);
    await markAdminIdleFresh(context.userId);
    return { ok: true as const };
  });

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ password: string | null }>`
    select password from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
    limit 1
  `.catch(() => []);
  const hash = rows[0]?.password;
  if (!hash) return false;
  try {
    return await verifyPassword({ hash, password });
  } catch {
    return false;
  }
}

export async function setUserPasswordHash(userId: string, password: string) {
  const hash = await hashPassword(password);
  const sql = await getSql();
  const existing = await sql<{ id: string }>`
    select id from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
    limit 1
  `.catch(() => []);
  if (!existing[0]) {
    throw new Error("This account signs in with Apple, Google, or Facebook. Set a password from Forgot password first.");
  }
  await sql`
    update "account"
    set password = ${hash}, "updatedAt" = now()
    where "userId" = ${userId} and "providerId" = 'credential'
  `;
}

export function reauthRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message === REAUTH_REQUIRED_MESSAGE;
}
