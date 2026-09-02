import { ingestTelemetry } from "@/lib/server/telemetry";

export function startWebVitals() {
  if (typeof window === "undefined") return;
  if ((window as { __keVitals?: boolean }).__keVitals) return;
  (window as { __keVitals?: boolean }).__keVitals = true;

  let lcp = 0;
  let cls = 0;
  let inp = 0;

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "largest-contentful-paint") lcp = entry.startTime;
        if (entry.entryType === "layout-shift" && !(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          cls += (entry as PerformanceEntry & { value: number }).value;
        }
      }
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    const po = new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as PerformanceEntry & { duration?: number };
      if (last?.duration != null) inp = Math.max(inp, last.duration);
    });
    po.observe({ type: "event", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  const flush = () => {
    if (!lcp && !cls && !inp) return;
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
}
