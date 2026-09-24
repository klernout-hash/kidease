/**
 * Resend webhook signature check (Svix).
 * Signing secret is RESEND_WEBHOOK_SECRET (`whsec_…` from the Resend dashboard).
 * No @/ imports — scripts/email-suppressions.test.mjs loads this file.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const RESEND_WEBHOOK_SECRET_ENV = "RESEND_WEBHOOK_SECRET";
/** Svix default. Rejects replays older than five minutes. */
export const RESEND_WEBHOOK_TOLERANCE_SEC = 300;

export class ResendSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendSignatureError";
  }
}

export type ResendWebhookHeaders = {
  id?: string | null;
  timestamp?: string | null;
  signature?: string | null;
};

function headerValue(headers: Headers, ...names: string[]): string {
  for (const name of names) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return "";
}

export function resendWebhookHeaders(request: Request): ResendWebhookHeaders {
  return {
    id: headerValue(request.headers, "svix-id", "webhook-id"),
    timestamp: headerValue(request.headers, "svix-timestamp", "webhook-timestamp"),
    signature: headerValue(request.headers, "svix-signature", "webhook-signature"),
  };
}

/** `whsec_<base64>` → raw HMAC key. A bare base64 secret is accepted too. */
export function resendWebhookSecretBytes(secret: string): Buffer {
  const trimmed = secret.trim().replace(/^whsec_/i, "");
  if (!trimmed) throw new ResendSignatureError("RESEND_WEBHOOK_SECRET missing");
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length === 0) throw new ResendSignatureError("RESEND_WEBHOOK_SECRET invalid");
  return bytes;
}

function signaturesMatch(expected: string, signatureHeader: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const parts = signatureHeader.split(" ");
  for (const part of parts) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig);
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) return true;
  }
  return false;
}

/**
 * Verify the raw body. Returns the parsed JSON object.
 * Throws ResendSignatureError on any failure (missing header, stale timestamp, bad mac, bad json).
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string,
  nowMs = Date.now(),
  toleranceSec = RESEND_WEBHOOK_TOLERANCE_SEC,
): unknown {
  const id = (headers.id || "").trim();
  const timestamp = (headers.timestamp || "").trim();
  const signature = (headers.signature || "").trim();
  if (!secret.trim()) throw new ResendSignatureError("RESEND_WEBHOOK_SECRET missing");
  if (!id || !timestamp || !signature) throw new ResendSignatureError("svix signature headers missing");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new ResendSignatureError("invalid svix timestamp");
  const age = Math.abs(Math.floor(nowMs / 1000) - ts);
  if (age > toleranceSec) throw new ResendSignatureError("svix timestamp too old");

  const key = resendWebhookSecretBytes(secret);
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  if (!signaturesMatch(expected, signature)) throw new ResendSignatureError("svix signature mismatch");

  try {
    return rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch {
    throw new ResendSignatureError("invalid json");
  }
}

export type ResendWebhookApply = (input: {
  event: unknown;
  svixId: string;
}) => Promise<{ suppressed: string[]; removed: string[] }>;

export type ResendWebhookLog = (input: { kind: "webhook_accept" | "webhook_reject"; detail: string }) => Promise<void>;

/**
 * HTTP handler. Unset RESEND_WEBHOOK_SECRET no-ops (200, no writes).
 * A present secret with a bad signature is 401. Apply errors are 500 so Resend retries.
 */
export async function handleResendWebhook(
  request: Request,
  deps: {
    secret?: string | null;
    apply: ResendWebhookApply;
    log?: ResendWebhookLog;
    nowMs?: number;
  },
): Promise<Response> {
  const raw = await request.text();
  const secret = (deps.secret ?? "").trim();
  const log = deps.log ?? (async () => undefined);

  if (!secret) {
    await log({ kind: "webhook_reject", detail: "resend secret missing" });
    return Response.json({ ok: true, skipped: "no-webhook-secret" });
  }

  let event: unknown;
  let svixId = "";
  try {
    const headers = resendWebhookHeaders(request);
    svixId = (headers.id || "").trim();
    event = verifyResendWebhook(raw, headers, secret, deps.nowMs);
  } catch (err) {
    const reason = err instanceof ResendSignatureError ? err.message : "resend verify failed";
    await log({ kind: "webhook_reject", detail: reason });
    return new Response("Unauthorized", { status: 401 });
  }

  const type =
    event && typeof event === "object" && typeof (event as { type?: unknown }).type === "string"
      ? (event as { type: string }).type
      : "";

  try {
    const result = await deps.apply({ event, svixId });
    await log({ kind: "webhook_accept", detail: `resend ${type || "ping"}` });
    return Response.json({
      ok: true,
      handled: type || "ping",
      suppressed: result.suppressed.length,
      removed: result.removed.length,
    });
  } catch (err) {
    console.error("[kidease-mail] resend webhook apply failed", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "apply failed" }, { status: 500 });
  }
}
