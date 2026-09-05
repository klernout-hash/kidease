import * as Sentry from "@sentry/react";
import { registerErrorCapture, type ObserveContext } from "@/lib/observe";
import {
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  SENTRY_PUBLIC_DSN_ENV,
  scrubSentryEvent,
  sentryDataCollection,
  sentryTracesSampleRate,
} from "@/lib/sentry-shared";

function publicDsn() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return String(env?.[SENTRY_PUBLIC_DSN_ENV] ?? "").trim();
}

function clientEnvironment() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.PROD) return "production";
  return env?.MODE || "development";
}

export function sentryBrowserEnabled() {
  return Boolean(publicDsn() && Sentry.getClient());
}

/** Init once in the browser. No-op when the public DSN is unset. */
export function initSentryBrowser() {
  if (typeof window === "undefined") return false;
  if (Sentry.getClient()) return true;
  const dsn = publicDsn();
  if (!dsn) return false;

  const environment = clientEnvironment();
  Sentry.init({
    dsn,
    environment,
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
    integrations: [Sentry.browserTracingIntegration()],
  });

  registerErrorCapture((error, context) => {
    captureClientError(error, context);
  });
  return true;
}

export function captureClientError(error: Error, context: ObserveContext = {}) {
  if (!Sentry.getClient()) return;
  Sentry.captureException(error, {
    tags: { route: context.route || "app" },
    extra: context.extra,
  });
}
