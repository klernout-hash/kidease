import { initSentryBrowser } from "@/lib/sentry.client";

initSentryBrowser();

if (typeof window !== "undefined") {
  window.addEventListener("kidease:analytics-granted", () => {
    initSentryBrowser();
  });
}
