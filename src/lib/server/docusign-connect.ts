/**
 * DocuSign Connect HMAC + payload parse. No Start/DB — tests import this file.
 * Secrets stay in DOCUSIGN_WEBHOOK_SECRET. Never read a secret from the query string.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function mapEnvelopeStatus(raw: string) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^envelope-/i, "")
    .replace(/^recipient-/i, "");
  if (s === "completed" || s === "signed") return "signed";
  if (s === "delivered" || s === "viewed") return "viewed";
  if (s === "declined") return "declined";
  if (s === "voided") return "voided";
  if (s === "sent" || s === "created") return "sent";
  return s || "sent";
}

function hmacDigest(secret: string, rawBody: string, encoding: "base64" | "hex") {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest(encoding);
}

function equalHidden(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    const dummy = a.length ? a : Buffer.alloc(1);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function webhookSecretFromEnv(env: Record<string, string | undefined> = process.env) {
  return (env.DOCUSIGN_WEBHOOK_SECRET || "").trim();
}

/** True when the URL itself carries a secret (rejected — logs and Referer leak). */
export function webhookUrlHasSecret(request: Request) {
  const url = new URL(request.url);
  const keys = ["secret", "webhook_secret", "token", "DOCUSIGN_WEBHOOK_SECRET"];
  return keys.some((key) => {
    const value = url.searchParams.get(key);
    return Boolean(value && value.trim());
  });
}

export function connectSignatures(request: Request) {
  const headers = [
    request.headers.get("x-docusign-signature-1"),
    request.headers.get("x-docusign-signature-2"),
    request.headers.get("x-authorization-digest"),
  ];
  return headers
    .flatMap((value) => (value || "").split(","))
    .map((value) => value.replace(/^sha256=/i, "").trim())
    .filter(Boolean);
}

export function authorizedWebhook(
  request: Request,
  rawBody: string,
  secret = webhookSecretFromEnv(),
) {
  if (!secret) return false;
  if (webhookUrlHasSecret(request)) return false;
  const got = connectSignatures(request);
  if (!got.length) return false;
  const base64 = hmacDigest(secret, rawBody, "base64");
  const hex = hmacDigest(secret, rawBody, "hex");
  return got.some((header) => equalHidden(header, base64) || equalHidden(header.toLowerCase(), hex));
}

export function parseConnectPayload(raw: string): { envelopeId: string; status: string; event: string } | null {
  const text = String(raw || "");
  if (!text.trim()) return null;
  try {
    const json = JSON.parse(text) as {
      event?: string;
      envelopeId?: string;
      status?: string;
      data?: {
        envelopeId?: string;
        envelopeSummary?: { status?: string; envelopeId?: string };
      };
    };
    const envelopeId = json.data?.envelopeId || json.data?.envelopeSummary?.envelopeId || json.envelopeId;
    const status = json.data?.envelopeSummary?.status || json.status || "";
    if (envelopeId) {
      return {
        envelopeId,
        status: mapEnvelopeStatus(status || json.event || ""),
        event: json.event || status || "",
      };
    }
  } catch {
    /* XML Connect payload */
  }
  const id = text.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i)?.[1];
  const status = text.match(/<Status>([^<]+)<\/Status>/i)?.[1];
  if (!id) return null;
  return { envelopeId: id, status: mapEnvelopeStatus(status || ""), event: status || "connect" };
}
