import { createServerFn } from "@tanstack/react-start";
import { reportError } from "@/lib/observe";
import { turnstileMode, type TurnstileMode } from "@/lib/turnstile-mode";
import {
  clientIpFromHeaders,
  readTurnstileToken,
  turnstileFailureMessage,
  turnstileRemoteIp,
  verifyTurnstileResponse,
} from "@/lib/server/turnstile-verify";

export { turnstileMode, type TurnstileMode };
export { clientIpFromHeaders, readTurnstileToken, turnstileRemoteIp };

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

export async function assertTurnstileToken(
  token: string | null | undefined,
  opts?: { headers?: Headers; remoteip?: string },
) {
  const resolved = (token || "").trim() || (opts?.headers ? readTurnstileToken(opts.headers) : "");
  const remoteip = opts?.remoteip || (opts?.headers ? turnstileRemoteIp(opts.headers) : undefined);
  const result = await verifyTurnstileResponse({
    token: resolved,
    secret: turnstileSecretKey(),
    mode: currentTurnstileMode(),
    remoteip,
  });
  if (result.ok) return { ok: true as const, skipped: result.skipped };
  const message = turnstileFailureMessage(result.errorCodes);
  if (!result.errorCodes?.includes("missing-input-response")) {
    reportError(new Error(message), {
      route: "turnstile",
      extra: { codes: (result.errorCodes || []).join(",") || "unknown" },
    });
  }
  throw new Error(message);
}

/** Public site key only — never the secret. */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  const site = turnstileSiteKey();
  const secret = turnstileSecretKey();
  if (!site || !secret) return null;
  return site;
});
