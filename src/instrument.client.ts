import { initSentryBrowser } from "@/lib/sentry.client";
import { startWebVitals } from "@/lib/web-vitals";

initSentryBrowser();

if (typeof window !== "undefined") {
  window.addEventListener("kidease:analytics-granted", () => {
    initSentryBrowser();
    startWebVitals();
  });
}
