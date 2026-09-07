import { createServerFn } from "@tanstack/react-start";
import { type EmailSignInExplanation } from "@/lib/auth/login-errors";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const oracleHits = new Map<string, { n: number; reset: number }>();

function allowOracle(email: string): boolean {
  const key = email || "unknown";
  const now = Date.now();
  const row = oracleHits.get(key);
  if (!row || row.reset <= now) {
    oracleHits.set(key, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (row.n >= 8) return false;
  row.n += 1;
  return true;
}

export const explainEmailSignInFailure = createServerFn({ method: "POST" })
  .validator((input: { email?: string }) => ({
    email: normalizeEmail(String(input?.email || "")),
  }))
  .handler(async ({ data }): Promise<EmailSignInExplanation> => {
    // Unauthenticated callers must not learn missing vs oauth-only vs has-password.
    if (!allowOracle(data.email)) return { kind: "unknown", providers: [] };
    return { kind: "unknown", providers: [] };
  });
