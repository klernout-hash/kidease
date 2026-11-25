/**
 * Public and parent forms → GoHighLevel contact (KidEase's own CRM).
 * Upserts the contact and adds `source:website` plus one `form:*` tag.
 * Support-type messages also open a card in the KidEase Site pipeline at the
 * Support stage, when its ids are set in the environment.
 *
 * No workflows, no mail, no text. Never a daycare's centre_leads CRM.
 * Never throws. scripts/ghl-form-lead.test.mjs loads this file in Node.
 */
import {
  GHL_API_BASE,
  contactIdFrom,
  ghlApiToken,
  ghlRequest,
  isForbiddenApprovedStage,
  opportunitiesFrom,
  opportunityIdFrom,
  resolveGhlApiTarget,
  type FetchImpl,
} from "./ghl-api.ts";
import { GHL_QA_TEST_TAG, ghlIntakeEnabled } from "./ghl-intake.ts";
import { ghlLeadPushEnabled, isQaGhlLead } from "./ghl-lead-push.ts";
import { runtimeProcessEnv, type EnvMap } from "./runtime-env.ts";

export const GHL_SITE_PIPELINE_ID_ENV = "GHL_SITE_PIPELINE_ID";
export const GHL_SITE_SUPPORT_STAGE_ID_ENV = "GHL_SITE_SUPPORT_STAGE_ID";

export const GHL_FORM_KEYS = [
  "contact",
  "help",
  "report",
  "tour",
  "info",
  "waitlist",
  "spot",
  "claim-start",
  "job-apply",
] as const;
export type GhlFormKey = (typeof GHL_FORM_KEYS)[number];

/** Forms that also open a KidEase Site → Support card. */
export const GHL_SUPPORT_FORMS: readonly GhlFormKey[] = ["contact", "help", "report"];

export type GhlFormSkipReason = "flag-off" | "intake-off" | "no-api-token" | "no-email";
export type GhlSupportOpportunity = "created" | "exists" | "skipped-no-pipeline" | "failed" | "none";

export type GhlFormLeadResult =
  | { ok: true; skipped: true; reason: GhlFormSkipReason }
  | {
      ok: true;
      skipped: false;
      contactId: string;
      tags: string[];
      opportunity: GhlSupportOpportunity;
      opportunityId?: string;
    }
  | { ok: false; error: string };

export function ghlFormTag(form: GhlFormKey): string {
  return `form:${form}`;
}

export function ghlFormTags(form: GhlFormKey, input: { email?: string | null; name?: string | null; isTest?: boolean }): string[] {
  const tags = ["source:website", ghlFormTag(form)];
  if (isQaGhlLead(input)) tags.push(GHL_QA_TEST_TAG);
  return tags;
}

/**
 * submitPublicMessage serves the contact page, help, report-a-listing, the
 * listing contact box, and jobs interest. Help and report send kind support.
 */
export function publicMessageForm(input: {
  kind: "contact" | "support" | "enroll";
  form?: string | null;
}): "contact" | "help" | "report" | null {
  if (input.kind === "enroll") return null;
  if (input.form === "report" || input.form === "help" || input.form === "contact") return input.form;
  return input.kind === "support" ? "help" : "contact";
}

/** KidEase Site pipeline + Support stage. Both must be set, or no card is made. */
export function resolveGhlSiteSupportTarget(env?: EnvMap): { locationId: string; pipelineId: string; pipelineStageId: string } | null {
  const source = env ?? runtimeProcessEnv();
  const pipelineId = String(source[GHL_SITE_PIPELINE_ID_ENV] || "").trim();
  const pipelineStageId = String(source[GHL_SITE_SUPPORT_STAGE_ID_ENV] || "").trim();
  if (!pipelineId || !pipelineStageId || isForbiddenApprovedStage(pipelineStageId)) return null;
  return { locationId: resolveGhlApiTarget("parent", source).locationId, pipelineId, pipelineStageId };
}

function splitName(name: string): { name?: string; firstName?: string; lastName?: string } {
  const full = name.trim();
  if (!full) return {};
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { name: full, firstName: parts[0] };
  return { name: full, firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Same switches as the sign-up lead push: FEATURE_GHL_LEAD_PUSH=1,
 * FEATURE_GHL_INTAKE not 0, and GHL_API_TOKEN set.
 */
export async function postGhlFormLead(input: {
  form: GhlFormKey;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  /** Short card title for a support opportunity. Never the message body. */
  subject?: string | null;
  isTest?: boolean;
  env?: EnvMap;
  fetchImpl?: FetchImpl;
  onSkip?: (reason: string) => void;
  onError?: (message: string) => void;
}): Promise<GhlFormLeadResult> {
  try {
    const env = input.env ?? runtimeProcessEnv();
    if (!ghlLeadPushEnabled(env)) {
      input.onSkip?.("flag-off");
      return { ok: true, skipped: true, reason: "flag-off" };
    }
    if (!ghlIntakeEnabled(env)) {
      input.onSkip?.("intake-off");
      return { ok: true, skipped: true, reason: "intake-off" };
    }
    const token = ghlApiToken(env);
    if (!token) {
      input.onSkip?.("no-api-token");
      return { ok: true, skipped: true, reason: "no-api-token" };
    }
    const email = String(input.email || "").trim();
    if (!email) {
      input.onSkip?.("no-email");
      return { ok: true, skipped: true, reason: "no-email" };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const locationId = resolveGhlApiTarget("parent", env).locationId;
    const identity: Record<string, unknown> = { locationId, email, ...splitName(input.name || "") };
    const phone = String(input.phone || "").trim();
    const company = String(input.company || "").trim();
    if (phone) identity.phone = phone;
    if (company) identity.companyName = company;
    const upsert = await ghlRequest({ token, url: `${GHL_API_BASE}/contacts/upsert`, method: "POST", body: identity, fetchImpl });
    if (!upsert.ok) {
      input.onError?.(upsert.error);
      return { ok: false, error: upsert.error };
    }
    const contactId = contactIdFrom(upsert.json);
    if (!contactId) {
      input.onError?.("GHL API contact id missing");
      return { ok: false, error: "GHL API contact id missing" };
    }
    // Upsert's tags field would replace every tag. Add tags on their own.
    const tags = ghlFormTags(input.form, { email, name: input.name, isTest: input.isTest });
    const tagged = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`,
      method: "POST",
      body: { tags },
      fetchImpl,
    });
    if (!tagged.ok) input.onError?.(tagged.error);

    if (!GHL_SUPPORT_FORMS.includes(input.form)) {
      return { ok: true, skipped: false, contactId, tags, opportunity: "none" };
    }
    const target = resolveGhlSiteSupportTarget(env);
    if (!target) {
      input.onSkip?.("support-opportunity: site pipeline or support stage id not set");
      return { ok: true, skipped: false, contactId, tags, opportunity: "skipped-no-pipeline" };
    }
    const searchUrl =
      `${GHL_API_BASE}/opportunities/search` +
      `?location_id=${encodeURIComponent(target.locationId)}` +
      `&pipeline_id=${encodeURIComponent(target.pipelineId)}` +
      `&contact_id=${encodeURIComponent(contactId)}`;
    const search = await ghlRequest({ token, url: searchUrl, method: "GET", fetchImpl });
    if (search.ok) {
      const open = opportunitiesFrom(search.json).find((row) => {
        const pipelineId = typeof row.pipelineId === "string" ? row.pipelineId : "";
        return !pipelineId || pipelineId === target.pipelineId;
      });
      if (open) {
        const opportunityId = typeof open.id === "string" ? open.id : "";
        return { ok: true, skipped: false, contactId, tags, opportunity: "exists", ...(opportunityId ? { opportunityId } : {}) };
      }
    }
    const title = String(input.subject || "").trim().slice(0, 120);
    const person = String(input.name || "").trim() || email;
    const created = await ghlRequest({
      token,
      url: `${GHL_API_BASE}/opportunities/`,
      method: "POST",
      body: {
        locationId: target.locationId,
        pipelineId: target.pipelineId,
        pipelineStageId: target.pipelineStageId,
        contactId,
        name: title ? `${ghlFormTag(input.form)}: ${title}` : `${ghlFormTag(input.form)}: ${person}`,
        status: "open",
      },
      fetchImpl,
    });
    if (!created.ok) {
      input.onError?.(created.error);
      return { ok: true, skipped: false, contactId, tags, opportunity: "failed" };
    }
    const opportunityId = opportunityIdFrom(created.json);
    return { ok: true, skipped: false, contactId, tags, opportunity: "created", ...(opportunityId ? { opportunityId } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ghl-form-failed";
    input.onError?.(message);
    return { ok: false, error: message };
  }
}
