/**
 * Sentry env names, noise filters, and PII scrubbers.
 * No SDK imports — safe for tests and for both client and server.
 */

/** Server-only DSN. Already set on Vercel Production. Never prefix VITE_. */
export const SENTRY_DSN_ENV = "SENTRY_DSN";
/**
 * Public browser DSN. Same value as SENTRY_DSN, set as a public Vercel env so
 * Vite can inline it. Do not read the private name from client code.
 */
export const SENTRY_PUBLIC_DSN_ENV = "VITE_PUBLIC_SENTRY_DSN";

export const SENTRY_TEST_MESSAGE = "KidEase Sentry test";

/** CSP connect-src hosts for the browser SDK envelope POST. */
export const SENTRY_CSP_CONNECT = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
] as const;

const PII_KEY =
  /email|e-mail|authorization|cookie|token|password|passwd|secret|otp|bearer|child[_-]?name|first[_-]?name|last[_-]?name|full[_-]?name|phone|ssn/i;

export const SENTRY_IGNORE_ERRORS = [
  /^Script error\.?$/,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /safari-web-extension:\/\//i,
  /webkit-masked-url/i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /window\.webkit\.messageHandlers/i,
  /instantSearchSDKJSBridgeClearHighlight/i,
  /atomicFindClose/i,
  /conduitPage/i,
  /top\.GLOBALS/i,
  /originalCreateNotification/i,
  /canvas\.contentDocument/i,
  /MyApp_RemoveAllHighlights/i,
  /jigsaw is not defined/i,
  /ComboSearch is not defined/i,
] as const;

export const SENTRY_DENY_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^safari-web-extension:\/\//i,
] as const;

export type SentryLikeEvent = {
  request?: {
    cookies?: Record<string, string> | string;
    headers?: Record<string, string>;
    data?: unknown;
    query_string?: unknown;
  };
  user?: {
    id?: string | number;
    email?: string;
    ip_address?: string;
    username?: string;
    name?: string;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>;
  message?: string;
  exception?: { values?: Array<{ value?: string; type?: string }> };
};

export function parseSentryDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const key = url.username;
    const project = url.pathname.replace(/^\//, "");
    if (!key || !project) return null;
    return {
      store: `${url.protocol}//${url.host}/api/${project}/store/`,
      host: url.host,
      key,
      project,
    };
  } catch {
    return null;
  }
}

export function sentryTracesSampleRate(environment: string) {
  return environment === "production" ? 0.1 : 0;
}

export function scrubPiiString(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [Filtered]")
    .replace(/(authorization|cookie)\s*[:=]\s*\S+/gi, "$1=[Filtered]");
}

export function scrubPiiValue(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (typeof value === "string") return scrubPiiString(value);
  if (Array.isArray(value)) return value.map((item) => scrubPiiValue(item, depth + 1));
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = PII_KEY.test(key) ? "[Filtered]" : scrubPiiValue(item, depth + 1);
    }
    return next;
  }
  return value;
}

function dropHeader(headers: Record<string, string> | undefined, name: string) {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) delete headers[key];
  }
}

/** Drop cookies, Authorization, emails, tokens, and child-name fields. */
export function scrubSentryEvent<T>(event: T): T {
  const next = event as T & SentryLikeEvent;
  if (next.request) {
    next.request.cookies = {};
    next.request.data = undefined;
    next.request.query_string = undefined;
    dropHeader(next.request.headers, "cookie");
    dropHeader(next.request.headers, "authorization");
    dropHeader(next.request.headers, "x-api-key");
  }
  if (next.user) {
    const id = next.user.id;
    next.user = id != null && id !== "" ? { id } : {};
  }
  if (next.extra) next.extra = scrubPiiValue(next.extra) as Record<string, unknown>;
  if (next.contexts) next.contexts = scrubPiiValue(next.contexts) as Record<string, unknown>;
  if (next.tags) next.tags = scrubPiiValue(next.tags) as Record<string, unknown>;
  if (next.message) next.message = scrubPiiString(next.message);
  if (next.exception?.values) {
    for (const value of next.exception.values) {
      if (value.value) value.value = scrubPiiString(value.value);
    }
  }
  if (next.breadcrumbs) {
    for (const crumb of next.breadcrumbs) {
      if (crumb.message) crumb.message = scrubPiiString(crumb.message);
      if (crumb.data) crumb.data = scrubPiiValue(crumb.data) as Record<string, unknown>;
    }
  }
  return event;
}

export function sentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [] as [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  };
}
