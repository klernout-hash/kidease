import { shouldStartTelemetry, type AnalyticsConsent } from "@/lib/analytics-consent";
import { isNative } from "@/lib/native";
import { ingestTelemetry } from "@/lib/server/telemetry";

export function shouldStartWebVitals(input?: { native?: boolean; consent?: AnalyticsConsent }): boolean {
  if (input) return shouldStartTelemetry("web-vitals", input);
  if (typeof window === "undefined") return false;
  return shouldStartTelemetry("web-vitals", { native: isNative() });
}

export function startWebVitals() {
  if (typeof window === "undefined") return;
  if ((window as { __keVitals?: boolean }).__keVitals) return;
  if (!shouldStartWebVitals()) return;
  (window as { __keVitals?: boolean }).__keVitals = true;

  let lcp = 0;
  let cls = 0;
  let inp = 0;

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "largest-contentful-paint") lcp = entry.startTime;
      }
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* unsupported */
  }

  onCLS((value) => {
    cls = value;
  }, { reportAllChanges: true });

  try {
    const po = new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as PerformanceEntry & { duration?: number };
      if (last?.duration != null) inp = Math.max(inp, last.duration);
    });
    po.observe({ type: "event", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  let sent = false;
  const flush = () => {
    if (sent) return;
    sent = true;
    void ingestTelemetry({
      data: {
        hits: [
          {
            kind: "view",
            geohash: "00000",
            slug: `vital:lcp=${Math.round(lcp)}:inp=${Math.round(inp)}:cls=${Math.round(cls * 1000)}`,
          },
        ],
      },
    }).catch(() => null);
  };
  window.addEventListener("pagehide", flush, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Layout-shift total. `reportAllChanges` updates the running value so a
 * pagehide flush is never a missing CLS (including a real zero).
 */
function onCLS(report: (value: number) => void, options: { reportAllChanges?: boolean } = {}) {
  if (typeof PerformanceObserver === "undefined") return;
  let value = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (shift.hadRecentInput) continue;
        value += shift.value || 0;
        if (options.reportAllChanges) report(value);
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }
  report(value);
}
