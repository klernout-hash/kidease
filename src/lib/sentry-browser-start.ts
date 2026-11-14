import { shouldStartTelemetry, type AnalyticsConsent } from "./analytics-consent.ts";

/** Evaluate the existing consent gate before downloading any browser SDK code. */
export function sentryBrowserEligible(input: {
  browser: boolean;
  dsn: string;
  native: boolean;
  consent?: AnalyticsConsent;
}): boolean {
  return Boolean(input.browser && input.dsn.trim() && shouldStartTelemetry("sentry", input));
}

type BrowserSentryModule = { initSentryBrowser: () => boolean };

/** One eligible import/init at a time. Failed or revoked starts can be retried. */
export function createSentryBrowserStart(input: {
  eligible: () => boolean;
  load: () => Promise<BrowserSentryModule>;
  onError: (error: unknown) => void;
}): () => Promise<boolean> | null {
  let pending: Promise<boolean> | null = null;
  return () => {
    if (!input.eligible()) return null;
    if (pending) return pending;
    pending = Promise.resolve()
      .then(input.load)
      .then((module) => {
        const started = module.initSentryBrowser();
        if (!started) pending = null;
        return started;
      })
      .catch((error: unknown) => {
        pending = null;
        input.onError(error);
        return false;
      });
    return pending;
  };
}

/** Ineligible visits run immediately; eligible visits wait for SDK initialization. */
export function afterBrowserInstrumentation(ready: Promise<unknown> | null, run: () => void): void {
  if (ready) void ready.then(run);
  else run();
}
