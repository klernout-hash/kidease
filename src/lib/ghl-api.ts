/**
 * KidEase → LeadConnector CRM (Path B API).
 * Private Integration token upserts a contact and creates an opportunity.
 * Inbound webhook URLs stay optional dual-write in ghl-intake.ts.
 *
 * No-op when GHL_API_TOKEN is unset. Never throws into the user path.
 *
 * Stage rule (Kyle 2026-09-24): the only automatic stage is Signed up.
 * Never Approved. Auto-Approved is forbidden. Approved happens only after
 * licence/screening. This module does not send the Approved stage id.
 * An opportunity that already exists in the target pipeline is left alone
 * so a repeat signup cannot pull a screened card backward or create a duplicate.
 */

import {
  ghlAudienceForTrigger,
  ghlIntakeEnabled,
  ghlIntakeTags,
  withQaTestTag,
  type GhlIntakeAudience,
  type GhlIntakeTrigger,
} from "./ghl-intake.ts";
import { runtimeProcessEnv, type EnvMap } from "./runtime-env.ts";

export const GHL_API_BASE = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";
/** Cloudflare returns 1010 to bare clients. Send a normal browser User-Agent. */
export const GHL_API_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
export const GHL_API_TIMEOUT_MS = 2500;
const GHL_API_ATTEMPTS = 2;

export const GHL_API_TOKEN_ENV = "GHL_API_TOKEN";
export const GHL_LOCATION_ID_ENV = "GHL_LOCATION_ID";
export const GHL_DAYCARE_PIPELINE_ID_ENV = "GHL_DAYCARE_PIPELINE_ID";
export const GHL_DAYCARE_SIGNED_UP_STAGE_ID_ENV = "GHL_DAYCARE_SIGNED_UP_STAGE_ID";
export const GHL_PARENT_PIPELINE_ID_ENV = "GHL_PARENT_PIPELINE_ID";
export const GHL_PARENT_SIGNED_UP_STAGE_ID_ENV = "GHL_PARENT_SIGNED_UP_STAGE_ID";

/** KidEase Winnipeg. Casing is significant. */
export const GHL_DEFAULT_LOCATION_ID = "hkAJnVH8EJpMcgq9bNjG";
export const GHL_DEFAULT_DAYCARE_PIPELINE_ID = "y95txOBNvB7hOMMcXggS";
/** Daycare Sign Up → Signed up. The only stage this client may assign. */
export const GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID = "0ee9095f-b05e-4493-88ab-603bf85ce759";
export const GHL_DEFAULT_PARENT_PIPELINE_ID = "EyzRc2UAWPVOqfdmkoYh";
/** Parent Onboard → Signed up. The only stage this client may assign. */
export const GHL_DEFAULT_PARENT_SIGNED_UP_STAGE_ID = "b219bee7-1593-4003-8798-d555883818ec";
/**
 * Daycare Sign Up → Approved. Never send this id. Approved is a human
 * licence/screening step. Auto-Approved is forbidden.
 */
export const GHL_FORBIDDEN_APPROVED_STAGE_ID = "fd5410ec-da7b-48a7-8f34-32f3f58045c7";

export type GhlApiSkipReason = "flag-off" | "no-api-token" | "no-email";

export type GhlApiResult =
  | { ok: true; skipped: true; reason: GhlApiSkipReason }
  | { ok: true; skipped: false; contactId: string; opportunity: "created" | "exists" }
  | { ok: false; error: string };

export type GhlApiTarget = {
  locationId: string;
  pipelineId: string;
  /** Always the Signed up stage for that pipeline. Never Approved. */
  pipelineStageId: string;
};

function readEnv(env?: EnvMap): EnvMap {
  return env ?? runtimeProcessEnv();
}

function trim(raw?: string | null): string {
  return (raw || "").trim();
}

export function ghlApiToken(env?: EnvMap): string {
  const raw = trim(readEnv(env)[GHL_API_TOKEN_ENV]);
  if (!raw) return "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

export function isForbiddenApprovedStage(stageId: string): boolean {
  return trim(stageId).toLowerCase() === GHL_FORBIDDEN_APPROVED_STAGE_ID.toLowerCase();
}

function envOrDefault(env: EnvMap, key: string, fallback: string): string {
  return trim(env[key]) || fallback;
}

/** Location, pipeline, and Signed up stage. Token is not required to resolve ids. */
export function resolveGhlApiTarget(audience: GhlIntakeAudience, env?: EnvMap): GhlApiTarget {
  const source = readEnv(env);
  if (audience === "parent") {
    return {
      locationId: envOrDefault(source, GHL_LOCATION_ID_ENV, GHL_DEFAULT_LOCATION_ID),
      pipelineId: envOrDefault(source, GHL_PARENT_PIPELINE_ID_ENV, GHL_DEFAULT_PARENT_PIPELINE_ID),
      pipelineStageId: envOrDefault(
        source,
        GHL_PARENT_SIGNED_UP_STAGE_ID_ENV,
        GHL_DEFAULT_PARENT_SIGNED_UP_STAGE_ID,
      ),
    };
  }
  return {
    locationId: envOrDefault(source, GHL_LOCATION_ID_ENV, GHL_DEFAULT_LOCATION_ID),
    pipelineId: envOrDefault(source, GHL_DAYCARE_PIPELINE_ID_ENV, GHL_DEFAULT_DAYCARE_PIPELINE_ID),
    pipelineStageId: envOrDefault(
      source,
      GHL_DAYCARE_SIGNED_UP_STAGE_ID_ENV,
      GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID,
    ),
  };
}

/**
 * Contact tags for the API path. Daycare events include claim:claimed.
 * Enroll Now also keeps form:enroll. Claim verify is the same daycare set.
 */
export function ghlApiContactTags(
  trigger: GhlIntakeTrigger,
  options?: { testListing?: boolean },
): string[] {
  const audience = ghlAudienceForTrigger(trigger);
  const tags = ghlIntakeTags(audience, trigger);
  if (audience === "daycare" && !tags.includes("claim:claimed")) tags.push("claim:claimed");
  return withQaTestTag(tags, options?.testListing);
}

function splitName(name: string): { name?: string; firstName?: string; lastName?: string } {
  const full = name.trim();
  if (!full) return {};
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { name: full, firstName: parts[0] };
  return { name: full, firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function buildGhlContactUpsertBody(input: {
  trigger: GhlIntakeTrigger;
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  testListing?: boolean;
  env?: EnvMap;
}): Record<string, unknown> {
  const audience = ghlAudienceForTrigger(input.trigger);
  const target = resolveGhlApiTarget(audience, input.env);
  const phone = trim(input.phone);
  const company = trim(input.company);
  const body: Record<string, unknown> = {
    locationId: target.locationId,
    email: input.email.trim(),
    ...splitName(input.name || ""),
    tags: ghlApiContactTags(input.trigger, { testListing: input.testListing }),
  };
  if (phone) body.phone = phone;
  if (company) body.companyName = company;
  return body;
}

export function buildGhlOpportunityBody(input: {
  trigger: GhlIntakeTrigger;
  contactId: string;
  name?: string | null;
  company?: string | null;
  email: string;
  env?: EnvMap;
}): Record<string, unknown> {
  const audience = ghlAudienceForTrigger(input.trigger);
  const target = resolveGhlApiTarget(audience, input.env);
  const company = trim(input.company);
  const person = trim(input.name);
  const opportunityName = company || person || input.email.trim() || "KidEase signup";
  return {
    locationId: target.locationId,
    pipelineId: target.pipelineId,
    pipelineStageId: target.pipelineStageId,
    contactId: input.contactId,
    name: opportunityName,
    status: "open",
  };
}

type FetchImpl = typeof fetch;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "ghl-api-failed";
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function contactIdFrom(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const row = json as { id?: unknown; contact?: { id?: unknown } };
  const nested = row.contact && typeof row.contact.id === "string" ? row.contact.id.trim() : "";
  if (nested) return nested;
  return typeof row.id === "string" ? row.id.trim() : "";
}

function opportunitiesFrom(json: unknown): Array<{ pipelineId?: string }> {
  if (!json || typeof json !== "object") return [];
  const list = (json as { opportunities?: unknown }).opportunities;
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item === "object") as Array<{ pipelineId?: string }>;
}

function duplicateOpportunity(status: number, json: unknown): boolean {
  if (status !== 400 && status !== 409 && status !== 422) return false;
  const text = JSON.stringify(json || "").toLowerCase();
  return /already|duplicate|exist/.test(text);
}

async function ghlRequest(input: {
  token: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
  fetchImpl: FetchImpl;
}): Promise<{ ok: true; status: number; json: unknown } | { ok: false; status: number; error: string; json: unknown }> {
  let lastStatus = 0;
  let lastError = "ghl-api-failed";
  let lastJson: unknown = null;
  for (let attempt = 1; attempt <= GHL_API_ATTEMPTS; attempt += 1) {
    try {
      const res = await input.fetchImpl(input.url, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: GHL_API_VERSION,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": GHL_API_USER_AGENT,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(GHL_API_TIMEOUT_MS),
      });
      const json = await readJson(res);
      if (res.ok) return { ok: true, status: res.status, json };
      lastStatus = res.status;
      lastJson = json;
      lastError = `GHL API ${res.status}`;
      if (res.status < 500) break;
    } catch (err) {
      lastError = errorMessage(err);
      lastStatus = 0;
    }
  }
  return { ok: false, status: lastStatus, error: lastError, json: lastJson };
}

/**
 * Upsert contact, add tags without wiping other CRM tags, create a Signed up
 * opportunity when that pipeline has none yet. Missing token / flag-off / HTTP
 * errors never throw.
 */
export async function postGhlCrmSignup(input: {
  trigger: GhlIntakeTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
  testListing?: boolean;
  fetchImpl?: FetchImpl;
  env?: EnvMap;
  onSkip?: (reason: GhlApiSkipReason) => void;
  onError?: (err: unknown) => void;
}): Promise<GhlApiResult> {
  try {
    const env = readEnv(input.env);
    if (!ghlIntakeEnabled(env)) {
      input.onSkip?.("flag-off");
      return { ok: true, skipped: true, reason: "flag-off" };
    }
    const token = ghlApiToken(env);
    if (!token) {
      input.onSkip?.("no-api-token");
      return { ok: true, skipped: true, reason: "no-api-token" };
    }
    const email = trim(input.email);
    if (!email) {
      input.onSkip?.("no-email");
      return { ok: true, skipped: true, reason: "no-email" };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const trigger = input.trigger;
    const audience = ghlAudienceForTrigger(trigger);
    const target = resolveGhlApiTarget(audience, env);
    if (isForbiddenApprovedStage(target.pipelineStageId)) {
      const err = new Error("refusing Approved stage");
      input.onError?.(err);
      return { ok: false, error: "refusing Approved stage" };
    }

    const upsertBody = buildGhlContactUpsertBody({
      trigger,
      email,
      name: input.name,
      phone: input.phone,
      company: input.company,
      testListing: input.testListing,
      env,
    });
    // Upsert's tags array replaces every tag. Send identity here, then add tags.
    const { tags, ...identity } = upsertBody;
    const upsert = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/contacts/upsert`,
      method: "POST",
      body: identity,
      fetchImpl,
    });
    if (!upsert.ok) {
      input.onError?.(new Error(upsert.error));
      return { ok: false, error: upsert.error };
    }
    const contactId = contactIdFrom(upsert.json);
    if (!contactId) {
      input.onError?.(new Error("GHL API contact id missing"));
      return { ok: false, error: "GHL API contact id missing" };
    }

    const tagList = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
    const tagged = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`,
      method: "POST",
      body: { tags: tagList },
      fetchImpl,
    });
    if (!tagged.ok) input.onError?.(new Error(tagged.error));

    if (tagList.includes("claim:claimed")) {
      const removed = await ghlRequest({
        token,
        url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`,
        method: "DELETE",
        body: { tags: ["claim:unclaimed"] },
        fetchImpl,
      });
      if (!removed.ok && removed.status !== 404) input.onError?.(new Error(removed.error));
    }

    // Query keys are snake_case. Camel case returns 422
    // "property locationId should not exist".
    const searchUrl =
      `${GHL_API_BASE}/opportunities/search` +
      `?location_id=${encodeURIComponent(target.locationId)}` +
      `&pipeline_id=${encodeURIComponent(target.pipelineId)}` +
      `&contact_id=${encodeURIComponent(contactId)}`;
    const search = await ghlRequest({ token, url: searchUrl, method: "GET", fetchImpl });
    if (search.ok) {
      const existing = opportunitiesFrom(search.json).some((row) => {
        const pipelineId = typeof row.pipelineId === "string" ? row.pipelineId : "";
        return !pipelineId || pipelineId === target.pipelineId;
      });
      if (existing) return { ok: true, skipped: false, contactId, opportunity: "exists" };
    }

    const created = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/opportunities/`,
      method: "POST",
      body: buildGhlOpportunityBody({
        trigger,
        contactId,
        name: input.name,
        company: input.company,
        email,
        env,
      }),
      fetchImpl,
    });
    if (created.ok) return { ok: true, skipped: false, contactId, opportunity: "created" };
    if (duplicateOpportunity(created.status, created.json)) {
      return { ok: true, skipped: false, contactId, opportunity: "exists" };
    }
    input.onError?.(new Error(created.error));
    return { ok: false, error: created.error };
  } catch (err) {
    input.onError?.(err);
    return { ok: false, error: errorMessage(err) };
  }
}

export const GHL_EMAIL_BOUNCED_TAG = "email:bounced";
export const GHL_EMAIL_COMPLAINED_TAG = "email:complained";

export type GhlEmailSuppressionReason = "bounce" | "complaint" | "manual" | "unsubscribe";

export type GhlEmailSuppressionResult =
  | { ok: true; skipped: true; reason: "flag-off" | "no-api-token" | "no-email" | "no-contact" }
  | { ok: true; skipped: false; contactId: string }
  | { ok: false; error: string };

/** Tag for a bounce or complaint. Manual and unsubscribe still get email DND. */
export function ghlEmailSuppressionTag(reason: GhlEmailSuppressionReason): string | null {
  if (reason === "bounce") return GHL_EMAIL_BOUNCED_TAG;
  if (reason === "complaint") return GHL_EMAIL_COMPLAINED_TAG;
  return null;
}

/**
 * Email-channel DND only. Global `dnd` stays unset so calls and SMS keep working.
 * `permanent` means HighLevel will not email this contact.
 */
export function buildGhlEmailDndBody(reason: GhlEmailSuppressionReason): Record<string, unknown> {
  return {
    dndSettings: {
      Email: {
        status: "permanent",
        message: `KidEase will not email this address (${reason}).`,
        code: reason,
      },
    },
  };
}

/**
 * Find an existing contact by email and stop HighLevel from mailing them.
 * Does not create a contact. Missing token, flag-off, and HTTP errors never throw.
 */
export async function suppressGhlEmail(input: {
  email?: string | null;
  reason: GhlEmailSuppressionReason;
  fetchImpl?: FetchImpl;
  env?: EnvMap;
  onSkip?: (reason: "flag-off" | "no-api-token" | "no-email" | "no-contact") => void;
  onError?: (err: unknown) => void;
}): Promise<GhlEmailSuppressionResult> {
  try {
    const env = readEnv(input.env);
    if (!ghlIntakeEnabled(env)) {
      input.onSkip?.("flag-off");
      return { ok: true, skipped: true, reason: "flag-off" };
    }
    const token = ghlApiToken(env);
    if (!token) {
      input.onSkip?.("no-api-token");
      return { ok: true, skipped: true, reason: "no-api-token" };
    }
    const email = trim(input.email).toLowerCase();
    if (!email || !email.includes("@")) {
      input.onSkip?.("no-email");
      return { ok: true, skipped: true, reason: "no-email" };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const locationId = resolveGhlApiTarget("daycare", env).locationId;
    const lookupUrl =
      `${GHL_API_BASE}/contacts/search/duplicate` +
      `?locationId=${encodeURIComponent(locationId)}` +
      `&email=${encodeURIComponent(email)}`;
    const lookup = await ghlRequest({ token, url: lookupUrl, method: "GET", fetchImpl });
    if (!lookup.ok) {
      if (lookup.status === 404) {
        input.onSkip?.("no-contact");
        return { ok: true, skipped: true, reason: "no-contact" };
      }
      input.onError?.(new Error(lookup.error));
      return { ok: false, error: lookup.error };
    }
    const contactId = contactIdFrom(lookup.json);
    if (!contactId) {
      input.onSkip?.("no-contact");
      return { ok: true, skipped: true, reason: "no-contact" };
    }

    const tag = ghlEmailSuppressionTag(input.reason);
    if (tag) {
      const tagged = await ghlRequest({
        token,
        url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`,
        method: "POST",
        body: { tags: [tag] },
        fetchImpl,
      });
      if (!tagged.ok) input.onError?.(new Error(tagged.error));
    }

    const dnd = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`,
      method: "PUT",
      body: buildGhlEmailDndBody(input.reason),
      fetchImpl,
    });
    if (!dnd.ok) {
      input.onError?.(new Error(dnd.error));
      return { ok: false, error: dnd.error };
    }
    return { ok: true, skipped: false, contactId };
  } catch (err) {
    input.onError?.(err);
    return { ok: false, error: errorMessage(err) };
  }
}
