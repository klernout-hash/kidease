import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isKidEaseOperatorEmail, KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { assertPasswordAllowed } from "@/lib/server/password-hygiene";
import { setUserPasswordHash, verifyUserPassword } from "@/lib/server/reauth";
import { REAUTH_REQUIRED_MESSAGE } from "@/lib/reauth";

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export const checkNewPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { password: string; email?: string }) => ({
    password: String(input?.password || ""),
    email: String(input?.email || ""),
  }))
  .handler(async ({ data }) => {
    await assertPasswordAllowed(data.password, data.email);
    return { ok: true as const };
  });

export const changeAccountPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { currentPassword: string; newPassword: string }) => ({
    currentPassword: String(input?.currentPassword || ""),
    newPassword: String(input?.newPassword || ""),
  }))
  .handler(async ({ context, data }) => {
    const { assertRecentReauth, isCurrentUserRecentlyReauthed, writeReauthCookie } =
      await import("./reauth.server");
    if (!isCurrentUserRecentlyReauthed(context.userId)) {
      if (!(await verifyUserPassword(context.userId, data.currentPassword))) {
        throw new Error(REAUTH_REQUIRED_MESSAGE);
      }
      writeReauthCookie(context.userId);
    } else if (!(await verifyUserPassword(context.userId, data.currentPassword))) {
      throw new Error("Current password is not correct.");
    }
    const actor = await lookupEmail(context.userId);
    await assertPasswordAllowed(data.newPassword, actor);
    if (data.currentPassword === data.newPassword) {
      throw new Error("Choose a new password that is different from the current one.");
    }
    await setUserPasswordHash(context.userId, data.newPassword);
    const sql = await getSql();
    const token = (await import("@/lib/auth/server")).readSessionToken();
    if (token) {
      await sql`delete from "session" where "userId" = ${context.userId} and token <> ${token}`.catch(() => undefined);
    }
    assertRecentReauth(context.userId);
    return { ok: true as const };
  });

export const changeAccountEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { newEmail: string; currentPassword?: string }) => ({
    newEmail: cleanEmail(input?.newEmail),
    currentPassword: String(input?.currentPassword || ""),
  }))
  .handler(async ({ context, data }) => {
    const { assertRecentReauth, isCurrentUserRecentlyReauthed, writeReauthCookie } =
      await import("./reauth.server");
    const current = await lookupEmail(context.userId);
    if (isKidEaseOperatorEmail(current)) {
      throw new Error(`The operator mailbox stays ${KIDEASE_OPERATOR_EMAIL}.`);
    }
    if (!data.newEmail.includes("@") || data.newEmail.length < 5) {
      throw new Error("Enter a valid email address.");
    }
    if (isKidEaseOperatorEmail(data.newEmail)) {
      throw new Error("That mailbox is reserved for the KidEase owner.");
    }
    if (data.newEmail === current) {
      throw new Error("That is already the email on this account.");
    }
    if (!isCurrentUserRecentlyReauthed(context.userId)) {
      if (!data.currentPassword || !(await verifyUserPassword(context.userId, data.currentPassword))) {
        throw new Error(REAUTH_REQUIRED_MESSAGE);
      }
      writeReauthCookie(context.userId);
    }
    assertRecentReauth(context.userId);
    const sql = await getSql();
    const taken = await sql<{ n: number }>`
      select count(*)::int as n from "user" where email = ${data.newEmail} and id <> ${context.userId}
    `.catch(() => [{ n: 1 }]);
    if ((taken[0]?.n ?? 1) > 0) {
      throw new Error("That email is already in use.");
    }
    await sql`
      update "user"
      set email = ${data.newEmail}, "emailVerified" = false, "updatedAt" = now()
      where id = ${context.userId}
    `;
    return { ok: true as const, email: data.newEmail };
  });

async function lookupEmail(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => []);
  return (rows[0]?.email || "").trim().toLowerCase();
}
