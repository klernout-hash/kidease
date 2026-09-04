import { createServerFn } from "@tanstack/react-start";
import { turnstileMode, type TurnstileMode } from "@/lib/turnstile-mode";

export { turnstileMode, type TurnstileMode };

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function env(key: string) {
  return (process.env[key] || "").trim();
}

export function turnstileSiteKey() {
  return env("TURNSTILE_SITE_KEY");
}

export function turnstileSecretKey() {
  return env("TURNSTILE_SECRET_KEY");
}

export function isProductionRuntime() {
  return env("VERCEL_ENV") === "production";
}

export function currentTurnstileMode() {
  return turnstileMode({
    siteKey: turnstileSiteKey(),
    secretKey: turnstileSecretKey(),
    production: isProductionRuntime(),
  });
}

export async function assertTurnstileToken(token: string | null | undefined) {
  const mode = currentTurnstileMode();
  if (mode === "off") return { ok: true as const, skipped: true as const };
  const trimmed = (token || "").trim();
  if (!trimmed) {
    if (mode === "enforce") throw new Error("Please complete the security check.");
    return { ok: true as const, skipped: true as const };
  }
  const secret = turnstileSecretKey();
  const res = await fetch(SITEVERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: trimmed }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
  if (!body?.success) {
    if (mode === "enforce") throw new Error("Security check failed. Refresh and try again.");
    return { ok: true as const, skipped: true as const };
  }
  return { ok: true as const, skipped: false as const };
}

/** Public site key only — never the secret. */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  const site = turnstileSiteKey();
  const secret = turnstileSecretKey();
  if (!site || !secret) return null;
  return site;
});
