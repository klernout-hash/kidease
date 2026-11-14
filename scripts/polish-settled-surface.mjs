/** QA-only iteration-4 geography/full-text readiness; never changes a timing sample. */
import { createHash } from "node:crypto";

export const SETTLED_SURFACE_CONTRACT = "geographic-full-surface-v4";
export const CONTROLLED_SEARCH_CASE = Object.freeze({
  query: "Winnipeg, MB",
  heading: "Winnipeg",
  minimumDistanceLabels: 1,
  explanation: "Explicit same-city query in both locales/phases; separate from iteration-3 empty-query metrics.",
});

export function controlledSearchPath(locale) {
  if (!["en", "fr"].includes(locale)) throw new Error("Unsupported controlled search locale.");
  return `${locale === "fr" ? "/fr" : ""}/search?q=${encodeURIComponent(CONTROLLED_SEARCH_CASE.query)}`;
}

/** Only visible public DOM and the requested local URL; no store or auth internals. */
export function inspectSearchGeography() {
  const shown = (node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
  };
  const text = (node) => (node?.innerText || "").replace(/\s+/g, " ").trim();
  const cards = [...document.querySelectorAll('.ke-search-results [data-slug],[data-ke="msv2-list"] [data-slug]')].filter(shown);
  const seen = new Set();
  const distanceLabels = cards.flatMap((node) => {
    const slug = node.getAttribute("data-slug");
    if (!slug || seen.has(slug)) return [];
    seen.add(slug);
    const labels = text(node).match(/\b\d+(?:[.,]\d+)?\s+km(?:\s+away)?\b/g) || [];
    return labels.length ? [{ slug, labels }] : [];
  });
  return {
    path: location.pathname,
    query: new URLSearchParams(location.search).get("q") || "",
    headings: [...document.querySelectorAll("h1")].filter(shown).map(text),
    whereValues: [...document.querySelectorAll('[data-ke="where-field"] input,[data-ke="msv2-where-input"]')].filter(shown).map((node) => node.value),
    distanceLabels,
    distanceLabelCount: distanceLabels.length,
  };
}

export function searchGeographyMatches(actual, expected) {
  if (!expected) return true;
  return Boolean(
    actual && actual.query === expected.query &&
    actual.headings?.includes(expected.heading) &&
    actual.distanceLabelCount >= expected.minimumDistanceLabels,
  );
}

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Keep the first observation and all meaningful text/distance fields intact.
 * Canonical preparation requires stable geography and full surface text. A
 * measured probe additionally requires the exact independently captured surface.
 * The clock starts on entry (call at DCL); this cannot move Lighthouse LCP/TBT.
 */
export async function waitForSettledSurface(page, {
  pageId,
  inspectSurface,
  expectedSurface = null,
  geography = pageId === "search" ? CONTROLLED_SEARCH_CASE : null,
  timeoutMs = 25000,
  stableMs = 500,
  pollMs = 150,
  initialDelayMs = 500,
  onInitial = null,
  now = Date.now,
} = {}) {
  if (typeof inspectSurface !== "function") throw new Error("A full surface inspector is required.");
  if (![timeoutMs, stableMs, pollMs, initialDelayMs].every(Number.isFinite) ||
      timeoutMs < 0 || stableMs < 0 || pollMs <= 0 || initialDelayMs < 0 || initialDelayMs > timeoutMs)
    throw new Error("Invalid bounded surface readiness settings.");
  const start = now();
  const expectedHash = expectedSurface ? hash(expectedSurface) : null;
  await page.waitForTimeout(initialDelayMs);
  let initial = null;
  let priorHash = null;
  let stableSince = null;
  let samples = 0;
  let last = null;
  let firstGeographyReadyMs = null;
  let firstParityMs = null;
  while (now() - start <= timeoutMs) {
    const surface = await page.evaluate(inspectSurface, { pageId });
    const observedGeography = geography ? await page.evaluate(inspectSearchGeography) : null;
    const surfaceHash = hash(surface);
    const geographyReady = searchGeographyMatches(observedGeography, geography);
    const fullContentParity = expectedHash ? surfaceHash === expectedHash : null;
    const elapsedMs = now() - start;
    samples += 1;
    last = { surface, surfaceHash, geography: observedGeography, geographyReady, fullContentParity, elapsedMs };
    if (!initial) {
      initial = last;
      if (onInitial) await onInitial(initial);
    }
    if (geographyReady && firstGeographyReadyMs === null) firstGeographyReadyMs = elapsedMs;
    if (fullContentParity === true && firstParityMs === null) firstParityMs = elapsedMs;
    const acceptable = geographyReady && fullContentParity !== false;
    // Stability includes location labels and all complete card text, not counts/slugs alone.
    const fingerprint = hash({ surface, geography: observedGeography });
    if (!acceptable) { priorHash = null; stableSince = null; }
    else if (fingerprint !== priorHash) { priorHash = fingerprint; stableSince = now(); }
    if (acceptable && samples >= 2 && now() - stableSince >= stableMs)
      return { contract: SETTLED_SURFACE_CONTRACT, settled: true, initial, final: last, samples, firstGeographyReadyMs, firstParityMs, elapsedMs: now() - start, stableForMs: now() - stableSince, timeoutMs };
    const remaining = timeoutMs - (now() - start);
    if (remaining <= 0) break;
    await page.waitForTimeout(Math.min(pollMs, remaining));
  }
  return { contract: SETTLED_SURFACE_CONTRACT, settled: false, initial, final: last, samples, firstGeographyReadyMs, firstParityMs, elapsedMs: now() - start, stableForMs: stableSince === null ? 0 : now() - stableSince, timeoutMs, reason: "Geographic labels and exact full surface did not settle within the bounded probe window." };
}
