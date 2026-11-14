import { isNative } from "@/lib/native";
import {
  afterBrowserInstrumentation,
  createSentryBrowserStart,
  sentryBrowserEligible,
} from "@/lib/sentry-browser-start";
import { startWebVitals } from "@/lib/web-vitals";

const initSentryBrowserWhenEligible = createSentryBrowserStart({
  eligible: () =>
    sentryBrowserEligible({
      browser: typeof window !== "undefined",
      // Keep Vite's existing public DSN name and the SDK's consent gate.
      dsn: String(import.meta.env.VITE_PUBLIC_SENTRY_DSN ?? "").trim(),
      native: isNative(),
    }),
  load: () => import("@/lib/sentry.client"),
  onError: () => {
    // Optional telemetry must not prevent paint or print SDK/configuration details.
    console.warn("[kidease] Browser error reporting did not start");
  },
});

// The client waits before React's first paint only when Sentry is eligible.
export const instrumentationReady = initSentryBrowserWhenEligible();

if (typeof window !== "undefined") {
  window.addEventListener("kidease:analytics-granted", () => {
    afterBrowserInstrumentation(initSentryBrowserWhenEligible(), startWebVitals);
  });
}
