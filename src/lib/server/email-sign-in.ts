import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import {
  classifyEmailAccounts,
  type EmailSignInExplanation,
} from "@/lib/auth/login-errors";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * After a failed password sign-in, say whether the email is missing, OAuth-only,
 * or has a credential hash. Never returns hashes or user ids.
 */
export async function explainEmailSignInFailureFor(email: string): Promise<EmailSignInExplanation> {
  const target = normalizeEmail(email);
  if (!target || !target.includes("@")) return { kind: "unknown", providers: [] };
  try {
    const sql = await getSql();
    const users = await sql<{ id: string }>`
      select id from "user" where lower(email) = ${target} limit 1
    `;
    const user = users[0];
    if (!user) return { kind: "missing", providers: [] };
    const accounts = await sql<{ providerId: string; password: string | null }>`
      select "providerId", password from account where "userId" = ${user.id}
    `;
    const kind = classifyEmailAccounts(accounts);
    const providers = accounts
      .map((row) => row.providerId)
      .filter((id) => id && id !== "credential" && id !== "email");
    return { kind, providers };
  } catch {
    return { kind: "unknown", providers: [] };
  }
}

export const explainEmailSignInFailure = createServerFn({ method: "POST" })
  .validator((input: { email?: string }) => ({
    email: normalizeEmail(String(input?.email || "")),
  }))
  .handler(async ({ data }): Promise<EmailSignInExplanation> => {
    return explainEmailSignInFailureFor(data.email);
  });
