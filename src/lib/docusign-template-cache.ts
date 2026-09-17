/**
 * In-memory DocuSign template-list cache + hourly-quota backoff.
 * Warm serverless instances keep this so Admin refresh does not re-list.
 */

import {
  docusignRateLimitIssue,
  type DocusignConnectIssue,
  type DocusignTemplateList,
} from "./docusign-errors.ts";

export const TEMPLATE_LIST_TTL_MS = 5 * 60 * 1000;
export const RATE_LIMIT_BACKOFF_MS = 20 * 60 * 1000;

type TemplateCacheState = {
  templates: Array<{ templateId: string; name: string }>;
  error: DocusignConnectIssue | null;
  freshUntil: number;
  rateLimitedUntil: number;
};

const emptyState = (): TemplateCacheState => ({
  templates: [],
  error: null,
  freshUntil: 0,
  rateLimitedUntil: 0,
});

let state: TemplateCacheState = emptyState();

export function resetDocusignTemplateCache() {
  state = emptyState();
}

export function rememberDocusignRateLimit(now = Date.now(), ttlMs = RATE_LIMIT_BACKOFF_MS) {
  const until = now + Math.max(0, ttlMs);
  if (until > state.rateLimitedUntil) state.rateLimitedUntil = until;
}

export function docusignIsRateLimited(now = Date.now()) {
  return state.rateLimitedUntil > now;
}

export function writeDocusignTemplateListCache(
  listed: DocusignTemplateList,
  now = Date.now(),
  ttlMs = TEMPLATE_LIST_TTL_MS,
) {
  state = {
    ...state,
    templates: listed.templates,
    error: listed.error,
    freshUntil: now + Math.max(0, ttlMs),
  };
}

export function readFreshDocusignTemplateList(now = Date.now()): DocusignTemplateList | null {
  if (state.freshUntil <= now) return null;
  return { templates: state.templates, error: state.error };
}

/** Cached templates even after TTL — used when the hourly quota is exhausted. */
export function cachedDocusignTemplates() {
  return state.templates;
}

export function listDocusignTemplatesCached(
  listed: DocusignTemplateList,
  now = Date.now(),
): DocusignTemplateList {
  if (listed.error?.code === "rate_limit") {
    rememberDocusignRateLimit(now);
    const templates = listed.templates.length ? listed.templates : state.templates;
    const next = { templates, error: docusignRateLimitIssue() };
    writeDocusignTemplateListCache(next, now, RATE_LIMIT_BACKOFF_MS);
    return next;
  }
  if (!listed.error) {
    writeDocusignTemplateListCache(listed, now);
  }
  return listed;
}

export function peekDocusignTemplateCacheForTests() {
  return { ...state, templates: [...state.templates] };
}
