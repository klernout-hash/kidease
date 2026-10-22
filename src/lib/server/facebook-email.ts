/**
 * Facebook accounts with no shared email are keyed on the Facebook id.
 * Messaging and booking stay closed until the person adds an email and
 * confirms the link we send.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  FACEBOOK_EMAIL_REQUIRED_MESSAGE,
  facebookContactBlocksAction,
  isFacebookPlaceholderEmail,
} from "@/lib/auth/facebook-idp";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import { getSql } from "@/lib/db";

export { FACEBOOK_EMAIL_REQUIRED_MESSAGE, facebookContactBlocksAction };

type ContactRow = {
  email: string | null;
  emailVerified: boolean | null;
  facebook_email_required: boolean | null;
};

async function ensureFacebookEmailColumn() {
  const sql = await getSql();
  await sql`alter table profiles add column if not exists facebook_email_required boolean not null default false`.catch(
    () => undefined,
  );
}

export async function markFacebookEmailRequired(userId: string): Promise<void> {
  await ensureFacebookEmailColumn();
  const sql = await getSql();
  // Do not insert a parent row here. Role choice (or the existing desk loader)
  // creates the profile. Updating a missing row is a no-op; the placeholder
  // email still blocks messaging and booking until a real address is saved.
  await sql`
    update profiles set facebook_email_required = true where user_id = ${userId}
  `.catch(() => undefined);
}

export async function readFacebookContact(userId: string): Promise<{
  email: string;
  emailVerified: boolean;
  facebookEmailRequired: boolean;
}> {
  const sql = await getSql();
  const rows = await sql<ContactRow>`
    select u.email, u."emailVerified", p.facebook_email_required
    from "user" u
    left join profiles p on p.user_id = u.id
    where u.id = ${userId}
    limit 1
  `.catch(() => [] as ContactRow[]);
  const row = rows[0];
  return {
    email: (row?.email || "").trim(),
    emailVerified: row?.emailVerified === true,
    facebookEmailRequired: row?.facebook_email_required === true,
  };
}

export async function assertFacebookContactEmail(userId: string): Promise<void> {
  const contact = await readFacebookContact(userId);
  if (facebookContactBlocksAction(contact)) {
    throw new Error(FACEBOOK_EMAIL_REQUIRED_MESSAGE);
  }
}

async function sendConfirmLink(email: string): Promise<boolean> {
  try {
    const { auth } = await import("@/lib/auth/server");
    let headers: Headers | undefined;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      headers = getRequest()?.headers;
    } catch {
      headers = undefined;
    }
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: "/account" },
      ...(headers ? { headers } : {}),
    });
    return true;
  } catch (err) {
    console.error("[kidease-mail] facebook email confirm failed", err instanceof Error ? err.name : "error");
    return false;
  }
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function emailLooksReal(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !isFacebookPlaceholderEmail(value);
}

export const saveFacebookContactEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email?: string }) => ({
    email: cleanEmail(String(input?.email || "")),
  }))
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("email");
    const current = await readFacebookContact(context.userId);
    const replacingPlaceholder = isFacebookPlaceholderEmail(current.email);
    const resendOnly = !data.email || data.email === current.email.toLowerCase();
    if (!replacingPlaceholder && !(current.facebookEmailRequired && !current.emailVerified && resendOnly)) {
      throw new Error("That email is already on this account.");
    }
    const nextEmail = resendOnly && !replacingPlaceholder ? current.email.toLowerCase() : data.email;
    if (!emailLooksReal(nextEmail)) {
      throw new Error("Enter a valid email address.");
    }
    if (isKidEaseOperatorEmail(nextEmail)) {
      throw new Error("That mailbox is reserved for the KidEase owner.");
    }
    const sql = await getSql();
    if (nextEmail !== current.email.toLowerCase()) {
      const taken = await sql<{ n: number }>`
        select count(*)::int as n from "user" where lower(email) = ${nextEmail} and id <> ${context.userId}
      `.catch(() => [{ n: 1 }]);
      if ((taken[0]?.n ?? 1) > 0) {
        throw new Error("That email is already in use.");
      }
      await sql`
        update "user"
        set email = ${nextEmail}, "emailVerified" = false, "updatedAt" = now()
        where id = ${context.userId}
      `;
    }
    await markFacebookEmailRequired(context.userId);
    const sent = await sendConfirmLink(nextEmail);
    return { ok: true as const, email: nextEmail, sent };
  });
