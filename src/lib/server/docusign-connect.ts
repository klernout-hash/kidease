/**
 * DocuSign Connect HMAC + payload parse. No Start/DB — tests import this file.
 * Secrets stay in DOCUSIGN_WEBHOOK_SECRET and optional DOCUSIGN_WEBHOOK_SECRETS.
 * Never read a secret from the query string.
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

/** Primary HMAC key, plus any comma-separated rotation keys. */
export function webhookSecretsFromEnv(env: Record<string, string | undefined> = process.env) {
  const primary = webhookSecretFromEnv(env);
  const extra = String(env.DOCUSIGN_WEBHOOK_SECRETS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(primary ? [primary, ...extra] : extra)];
}

function accountKey(id: string) {
  return id.trim().toLowerCase().replace(/[{}-]/g, "");
}

/** KidEase account, plus any extra Connect accounts we explicitly allow. */
export function connectAccountAllowlist(env: Record<string, string | undefined> = process.env) {
  const primary = String(env.DOCUSIGN_ACCOUNT_ID || "").trim();
  const extra = String(env.DOCUSIGN_CONNECT_ACCOUNT_IDS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(primary ? [primary, ...extra] : extra)];
}

export function connectAccountIsKnown(accountId: string, allowlist: readonly string[]) {
  const key = accountKey(accountId);
  if (!key) return false;
  return allowlist.some((id) => accountKey(id) === key);
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
  secret: string | readonly string[] = webhookSecretsFromEnv(),
) {
  const secrets = (Array.isArray(secret) ? secret : [secret]).map((value) => value.trim()).filter(Boolean);
  if (!secrets.length) return false;
  if (webhookUrlHasSecret(request)) return false;
  const got = connectSignatures(request);
  if (!got.length) return false;
  return secrets.some((key) => {
    const base64 = hmacDigest(key, rawBody, "base64");
    const hex = hmacDigest(key, rawBody, "hex");
    return got.some((header) => equalHidden(header, base64) || equalHidden(header.toLowerCase(), hex));
  });
}

/** Account id from JSON Connect, the REST uri, or legacy XML. */
export function parseConnectAccountId(raw: string): string | null {
  const text = String(raw || "");
  if (!text.trim()) return null;
  try {
    const json = JSON.parse(text) as {
      accountId?: string;
      uri?: string;
      data?: {
        accountId?: string;
        uri?: string;
        envelopeSummary?: { accountId?: string };
      };
    };
    const direct = json.data?.accountId || json.accountId || json.data?.envelopeSummary?.accountId;
    if (direct && String(direct).trim()) return String(direct).trim();
    const uri = String(json.uri || json.data?.uri || "");
    const fromUri = uri.match(/\/accounts\/([^/]+)\//i)?.[1];
    if (fromUri) return decodeURIComponent(fromUri).trim();
  } catch {
    /* XML Connect payload */
  }
  const xml = text.match(/<AccountId>([^<]+)<\/AccountId>/i)?.[1];
  return xml?.trim() || null;
}

export type ConnectPayload = { envelopeId: string; status: string; event: string };

export type ConnectWebhookPlan =
  | { kind: "query_secret" }
  | { kind: "not_configured" }
  | { kind: "foreign_account" }
  | { kind: "bad_signature" }
  | { kind: "unknown_account" }
  | { kind: "empty" }
  | { kind: "accept"; parsed: ConnectPayload };

/**
 * Decide before any database write.
 * 401 only when the URL leaks a secret, or a known account has a bad HMAC.
 * A missing secret and a foreign account (another company's Connect traffic)
 * answer 200 so DocuSign does not disable the configuration.
 */
export function planConnectWebhook(
  request: Request,
  rawBody: string,
  env: Record<string, string | undefined> = process.env,
): ConnectWebhookPlan {
  if (webhookUrlHasSecret(request)) return { kind: "query_secret" };
  if (!webhookSecretsFromEnv(env).length) return { kind: "not_configured" };
  const accountId = parseConnectAccountId(rawBody);
  if (accountId && !connectAccountIsKnown(accountId, connectAccountAllowlist(env))) {
    return { kind: "foreign_account" };
  }
  if (!authorizedWebhook(request, rawBody, webhookSecretsFromEnv(env))) {
    return accountId ? { kind: "bad_signature" } : { kind: "unknown_account" };
  }
  const parsed = rawBody ? parseConnectPayload(rawBody) : null;
  if (!parsed) return { kind: "empty" };
  return { kind: "accept", parsed };
}

export function parseConnectPayload(raw: string): ConnectPayload | null {
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
