/**
 * Per-centre API. Keys are hashed. Child health fields are refused.
 * Webhooks stay off until the centre turns them on, and only over HTTPS.
 * scripts/centre-leads.test.mjs loads this file in Node.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  LEAD_PRIVACY_NOTICE,
  cleanAgeGroup,
  cleanContact,
  cleanNote,
  cleanStartMonth,
  healthFieldNames,
  isCentreLeadStage,
  isLostReason,
  toPublicLead,
  type PublicLead,
} from "./centre-leads.ts";

export const CENTRE_API_LIMIT = 60;

export function hashCentreApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintCentreApiKey(): { token: string; prefix: string; hash: string } {
  const token = `ke_${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, 11), hash: hashCentreApiKey(token) };
}

export function sameKeyHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export type ApiScope = "read" | "write";

export function parseScopes(raw: string | readonly string[]): ApiScope[] {
  const parts = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const scopes = new Set<ApiScope>();
  for (const part of parts) {
    const value = String(part || "").trim();
    if (value === "read" || value === "write") scopes.add(value);
  }
  if (scopes.has("write")) scopes.add("read");
  return [...scopes];
}

export function scopeAllows(scopes: readonly string[], method: string): boolean {
  const parsed = parseScopes(scopes);
  if (method === "GET") return parsed.includes("read");
  if (method === "POST" || method === "PATCH") return parsed.includes("write");
  return false;
}

export type ApiKeyRow = {
  id: string;
  daycareId: string;
  scopes: readonly string[];
  revoked: boolean;
  hash: string;
};

export function centreApiDecision(input: {
  key: ApiKeyRow | null;
  presentedHash: string;
  requestedDaycareId?: string | null;
  method: string;
  hitsInWindow: number;
}):
  | { ok: true; daycareId: string; keyId: string }
  | { ok: false; status: 401 | 403 | 429; error: string } {
  if (!input.key || input.key.revoked || !sameKeyHash(input.key.hash, input.presentedHash)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (input.hitsInWindow >= CENTRE_API_LIMIT) return { ok: false, status: 429, error: "rate_limited" };
  const requested = String(input.requestedDaycareId || "").trim();
  if (requested && requested !== input.key.daycareId) return { ok: false, status: 403, error: "wrong_centre" };
  if (!scopeAllows(input.key.scopes, input.method)) return { ok: false, status: 403, error: "scope" };
  return { ok: true, daycareId: input.key.daycareId, keyId: input.key.id };
}

export function rateWindowStart(now: Date): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}

export function bearerToken(header: string | null): string | null {
  const value = String(header || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token.startsWith("ke_") && token.length >= 20 ? token : null;
}

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/;

export function webhookUrlAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || !host.includes(".") || PRIVATE_HOST.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
  return true;
}

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function webhookHeader(secret: string, timestamp: string, body: string): string {
  return `t=${timestamp},v1=${signWebhook(secret, timestamp, body)}`;
}

const RETRY_MS = [0, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export function webhookNextAttempt(attempt: number, now: Date): Date | null {
  if (attempt < 0 || attempt >= RETRY_MS.length) return null;
  return new Date(now.getTime() + RETRY_MS[attempt]!);
}

export type ApiLead = PublicLead;

export type CentreApiStore = {
  findKey(hash: string): Promise<ApiKeyRow | null>;
  countHits(keyId: string, windowStart: string): Promise<number>;
  addHit(keyId: string, windowStart: string): Promise<void>;
  touchKey(keyId: string, at: string): Promise<void>;
  audit(input: { daycareId: string; keyId: string | null; action: string; status: number }): Promise<void>;
  listLeads(daycareId: string): Promise<Record<string, unknown>[]>;
  getLead(daycareId: string, id: string): Promise<Record<string, unknown> | null>;
  updateStage(input: {
    daycareId: string;
    id: string;
    stage: string;
    lostReason: string | null;
  }): Promise<Record<string, unknown> | null>;
  addNote(input: { daycareId: string; id: string; body: string }): Promise<Record<string, unknown> | null>;
  createLead(input: {
    daycareId: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    childLabel: string | null;
    ageGroup: string | null;
    desiredStart: string | null;
  }): Promise<{ lead: Record<string, unknown>; reused: boolean } | null>;
};

function privacy(locale: string) {
  return locale === "fr" ? LEAD_PRIVACY_NOTICE.fr : LEAD_PRIVACY_NOTICE.en;
}

function json(status: number, body: Record<string, unknown>, locale: string) {
  return Response.json({ ...body, privacy: privacy(locale) }, { status });
}

export async function handleCentreApi(input: {
  request: Request;
  store: CentreApiStore;
  enabled: boolean;
  now?: Date;
}): Promise<Response> {
  const now = input.now ?? new Date();
  const url = new URL(input.request.url);
  const locale = url.searchParams.get("lang") === "fr" ? "fr" : "en";
  if (!input.enabled) return json(404, { error: "not_found" }, locale);
  const token = bearerToken(input.request.headers.get("authorization"));
  if (!token) return json(401, { error: "unauthorized" }, locale);
  const hash = hashCentreApiKey(token);
  const key = await input.store.findKey(hash);
  const method = input.request.method.toUpperCase();
  const windowStart = rateWindowStart(now);
  const hits = key ? await input.store.countHits(key.id, windowStart) : 0;
  const requested = input.request.headers.get("x-kidease-centre");
  const decision = centreApiDecision({
    key,
    presentedHash: hash,
    requestedDaycareId: requested,
    method,
    hitsInWindow: hits,
  });
  const path = url.pathname.replace(/\/$/, "");
  const match = path.match(/\/api\/v1\/centre\/leads(?:\/([^/]+))?(?:\/(notes))?$/);
  const action = `${method} ${match?.[2] ? "note" : match?.[1] ? "lead" : "leads"}`;
  if (!decision.ok) {
    if (key && !key.revoked) await input.store.audit({ daycareId: key.daycareId, keyId: key.id, action, status: decision.status });
    return json(decision.status, { error: decision.error }, locale);
  }
  if (!match) {
    await input.store.audit({ daycareId: decision.daycareId, keyId: decision.keyId, action, status: 404 });
    return json(404, { error: "not_found" }, locale);
  }
  await input.store.addHit(decision.keyId, windowStart);
  await input.store.touchKey(decision.keyId, now.toISOString());
  const leadId = match[1] ? decodeURIComponent(match[1]) : "";
  const note = match[2] === "notes";
  let status = 200;
  let body: Record<string, unknown> = {};
  try {
    if (method === "GET" && !leadId) {
      const rows = await input.store.listLeads(decision.daycareId);
      body = { leads: rows.map((row) => toPublicLead(row)) };
    } else if (method === "GET" && leadId && !note) {
      const row = await input.store.getLead(decision.daycareId, leadId);
      if (!row) status = 404;
      body = row ? { lead: toPublicLead(row) } : { error: "not_found" };
    } else if (method === "PATCH" && leadId && !note) {
      const payload = (await input.request.json().catch(() => null)) as Record<string, unknown> | null;
      const health = healthFieldNames(payload);
      if (health.length) {
        status = 400;
        body = { error: "health_not_accepted" };
      } else if (!payload || !isCentreLeadStage(String(payload.stage || ""))) {
        status = 400;
        body = { error: "bad_stage" };
      } else if (payload.stage === "lost" && !isLostReason(String(payload.lostReason || ""))) {
        status = 400;
        body = { error: "lost_reason" };
      } else {
        const row = await input.store.updateStage({
          daycareId: decision.daycareId,
          id: leadId,
          stage: String(payload.stage),
          lostReason: payload.stage === "lost" ? String(payload.lostReason) : null,
        });
        if (!row) status = 404;
        body = row ? { lead: toPublicLead(row) } : { error: "not_found" };
      }
    } else if (method === "POST" && leadId && note) {
      const payload = (await input.request.json().catch(() => null)) as Record<string, unknown> | null;
      const text = cleanNote(String(payload?.body || ""));
      if (!text) {
        status = 400;
        body = { error: "note" };
      } else {
        const row = await input.store.addNote({ daycareId: decision.daycareId, id: leadId, body: text });
        if (!row) status = 404;
        body = row ? { lead: toPublicLead(row) } : { error: "not_found" };
      }
    } else if (method === "POST" && !leadId) {
      const payload = (await input.request.json().catch(() => null)) as Record<string, unknown> | null;
      const health = healthFieldNames(payload);
      if (!payload || health.length) {
        status = 400;
        body = { error: health.length ? "health_not_accepted" : "body" };
      } else {
        const contactName = cleanContact(String(payload.contactName || payload.name || ""));
        const contactEmail = cleanContact(String(payload.contactEmail || payload.email || ""), 180);
        if (!contactName && !contactEmail) {
          status = 400;
          body = { error: "name_or_email" };
        } else {
          const created = await input.store.createLead({
            daycareId: decision.daycareId,
            contactName,
            contactEmail,
            contactPhone: cleanContact(String(payload.contactPhone || payload.phone || ""), 40),
            childLabel: cleanContact(String(payload.childLabel || ""), 80),
            ageGroup: cleanAgeGroup(String(payload.ageGroup || "")),
            desiredStart: cleanStartMonth(String(payload.desiredStart || "")),
          });
          if (!created) status = 400;
          body = created
            ? { lead: toPublicLead(created.lead), reused: created.reused }
            : { error: "not_saved" };
          if (created && !created.reused) status = 201;
        }
      }
    } else {
      status = 404;
      body = { error: "not_found" };
    }
  } catch {
    status = 500;
    body = { error: "error" };
  }
  await input.store.audit({ daycareId: decision.daycareId, keyId: decision.keyId, action, status });
  return json(status, body, locale);
}
