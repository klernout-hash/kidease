/**
 * Cloudflare Turnstile siteverify helpers (no TanStack / env).
 *
 * Tokens are single-use. A widget that still says "Success!" can hold a token
 * that siteverify already consumed (double POST, fetch retry, bfcache back to
 * /login). Without an idempotency key that looks like a false
 * "Security check failed" after a green checkbox.
 */
import type { TurnstileMode } from "@/lib/turnstile-mode";

export const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_TTL_MS = 5 * 60 * 1000;

const TURNSTILE_HEADER_NAMES = ["x-turnstile-token", "x-captcha-response", "cf-turnstile-response"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SiteverifyBody = {
  success?: boolean;
  "error-codes"?: string[];
  hostname?: string;
};

export type VerifyTurnstileResult = {
  ok: boolean;
  skipped: boolean;
  cached?: boolean;
  errorCodes?: string[];
};

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

type HeaderReader = { get(name: string): string | null };

const inFlight = new Map<string, Promise<SiteverifyBody>>();
const acceptedUntil = new Map<string, number>();

export function resetTurnstileVerifyCacheForTests() {
  inFlight.clear();
  acceptedUntil.clear();
}

export function isTurnstileIdempotencyKey(value: string) {
  return UUID_RE.test(value);
}

/** Stable UUID so retries of the same token reuse Cloudflare's cached result. */
export async function turnstileIdempotencyKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  const variant = Number.parseInt(chars[16] || "0", 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const h = chars.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function readTurnstileToken(headers: HeaderReader): string {
  for (const name of TURNSTILE_HEADER_NAMES) {
    const value = (headers.get(name) || "").trim();
    if (value) return value;
  }
  return "";
}

export function clientIpFromHeaders(headers: HeaderReader): string | undefined {
  const cf = (headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf;
  const real = (headers.get("x-real-ip") || "").trim();
  if (real) return real;
  const vercel = (headers.get("x-vercel-forwarded-for") || "").split(",")[0]?.trim();
  if (vercel) return vercel;
  const fwd = (headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return fwd || undefined;
}

/**
 * Siteverify `remoteip` must be the browser, not a proxy hop. A wrong IP
 * (Vercel edge, Cloudflare-to-Vercel) makes a valid widget token fail.
 * Only send Cloudflare's visitor IP; omit otherwise.
 */
export function turnstileRemoteIp(headers: HeaderReader): string | undefined {
  const cf = (headers.get("cf-connecting-ip") || "").trim();
  return cf || undefined;
}

const BODY_TOKEN_KEYS = ["turnstileToken", "cf-turnstile-response", "captchaResponse"];

/** Token from a JSON auth body when custom headers were stripped. */
export function readTurnstileTokenFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const row = body as Record<string, unknown>;
  for (const key of BODY_TOKEN_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asSiteverifyBody(value: unknown): SiteverifyBody {
  if (!value || typeof value !== "object") return { success: false, "error-codes": ["internal-error"] };
  const row = value as SiteverifyBody;
  const codes = Array.isArray(row["error-codes"])
    ? row["error-codes"].filter((code): code is string => typeof code === "string")
    : undefined;
  return { success: Boolean(row.success), "error-codes": codes, hostname: row.hostname };
}

async function siteverifyWithRetry(input: {
  token: string;
  secret: string;
  remoteip?: string;
  fetch: FetchLike;
  retryDelayMs: number;
}): Promise<SiteverifyBody> {
  const idempotencyKey = await turnstileIdempotencyKey(input.token);
  let last: SiteverifyBody = { success: false, "error-codes": ["internal-error"] };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const params = new URLSearchParams({
        secret: input.secret,
        response: input.token,
        idempotency_key: idempotencyKey,
      });
      if (input.remoteip) params.set("remoteip", input.remoteip);
      const res = await input.fetch(TURNSTILE_SITEVERIFY, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const body = asSiteverifyBody(await res.json().catch(() => null));
      if (body.success) return body;
      last = body;
      // A 200 already consumed the single-use token. Retrying it is a
      // timeout-or-duplicate false failure — only retry transport / 5xx.
      if (res.ok) return last;
      const codes = last["error-codes"] || [];
      const retryable = !res.ok || codes.includes("internal-error");
      if (!retryable) return last;
    } catch {
      last = { success: false, "error-codes": ["internal-error"] };
    }
    if (attempt < 1) await wait(input.retryDelayMs * (attempt + 1));
  }
  return last;
}

export async function verifyTurnstileResponse(input: {
  token: string | null | undefined;
  secret: string;
  mode: TurnstileMode;
  remoteip?: string;
  fetch?: FetchLike;
  now?: number;
  retryDelayMs?: number;
}): Promise<VerifyTurnstileResult> {
  const mode = input.mode;
  if (mode === "off") return { ok: true, skipped: true };
  const trimmed = (input.token || "").trim();
  if (!trimmed) {
    if (mode === "enforce") return { ok: false, skipped: false, errorCodes: ["missing-input-response"] };
    return { ok: true, skipped: true };
  }
  const secret = (input.secret || "").trim();
  if (!secret) {
    if (mode === "enforce") return { ok: false, skipped: false, errorCodes: ["missing-input-secret"] };
    return { ok: true, skipped: true };
  }

  const now = input.now ?? Date.now();
  const key = await turnstileIdempotencyKey(trimmed);
  const until = acceptedUntil.get(key);
  if (until && until > now) return { ok: true, skipped: false, cached: true };

  const fetchImpl = input.fetch ?? fetch;
  const pending = inFlight.get(key);
  const run =
    pending ??
    siteverifyWithRetry({
      token: trimmed,
      secret,
      remoteip: input.remoteip,
      fetch: fetchImpl,
      retryDelayMs: input.retryDelayMs ?? 40,
    });
  if (!pending) inFlight.set(key, run);
  try {
    const body = await run;
    if (body.success) {
      acceptedUntil.set(key, now + TURNSTILE_TOKEN_TTL_MS);
      return { ok: true, skipped: false, errorCodes: body["error-codes"] };
    }
    const codes = body["error-codes"] || [];
    const accepted = acceptedUntil.get(key);
    if (accepted && accepted > now && codes.includes("timeout-or-duplicate")) {
      return { ok: true, skipped: false, cached: true, errorCodes: codes };
    }
    if (mode === "enforce") return { ok: false, skipped: false, errorCodes: codes };
    return { ok: true, skipped: true, errorCodes: codes };
  } finally {
    if (!pending) inFlight.delete(key);
  }
}

export function turnstileFailureMessage(errorCodes: string[] | undefined) {
  if (errorCodes?.includes("missing-input-response")) {
    return "Please complete the security check.";
  }
  if (errorCodes?.includes("timeout-or-duplicate")) {
    return "Security check expired. Complete it again, then try once.";
  }
  if (errorCodes?.includes("invalid-input-response")) {
    return "Security check expired. Complete it again, then try once.";
  }
  return "Security check failed. Refresh and try again.";
}
