import * as Sentry from "@sentry/node";
import { registerErrorCapture, type ObserveContext } from "@/lib/observe";
import {
  SENTRY_DENY_URLS,
  SENTRY_DSN_ENV,
  SENTRY_IGNORE_ERRORS,
  SENTRY_PUBLIC_DSN_ENV,
  scrubSentryEvent,
  sentryDataCollection,
  sentryTracesSampleRate,
} from "@/lib/sentry-shared";

function readEnv(name: string) {
  return (typeof process !== "undefined" ? process.env[name] : undefined)?.trim() || "";
}

/** Prefer the private server DSN; accept the public name as a fallback. */
export function sentryServerDsn() {
  return readEnv(SENTRY_DSN_ENV) || readEnv(SENTRY_PUBLIC_DSN_ENV);
}

function serverEnvironment() {
  return readEnv("VERCEL_ENV") || readEnv("NODE_ENV") || "development";
}

export function sentryServerEnabled() {
  return Boolean(sentryServerDsn() && Sentry.getClient());
}

/** Init once on the server. No-op when no DSN is set (local safe). */
export function initSentryServer() {
  if (Sentry.getClient()) return true;
  const dsn = sentryServerDsn();
  if (!dsn) return false;

  const environment = serverEnvironment();
  Sentry.init({
    dsn,
    environment,
    release: readEnv("VERCEL_GIT_COMMIT_SHA") || undefined,
    sendDefaultPii: false,
    dataCollection: sentryDataCollection(),
    tracesSampleRate: sentryTracesSampleRate(environment),
    ignoreErrors: [...SENTRY_IGNORE_ERRORS],
    denyUrls: [...SENTRY_DENY_URLS],
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event);
    },
  });

  registerErrorCapture((error, context) => {
    captureServerError(error, context);
  });
  return true;
}

export function captureServerError(error: Error, context: ObserveContext = {}) {
  if (!Sentry.getClient()) return;
  Sentry.captureException(error, {
    tags: { route: context.route || "server" },
    extra: context.extra,
  });
}

export async function flushSentry(timeoutMs = 2000) {
  if (!Sentry.getClient()) return true;
  return Sentry.flush(timeoutMs);
}

export { Sentry };
