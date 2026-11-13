import { readSearchEvidence, type SearchEvidence } from "./search-evidence.ts";

/** Coverage is about retrieved listings, never a promise of real-world availability. */
export function searchCoverageCopy(value: unknown, locale: string) {
  const evidence = readSearchEvidence(value);
  const fr = locale === "fr";
  const incomplete = evidence.status !== "complete";
  return {
    evidence,
    incomplete,
    count: (total: number) => evidence.totalKind === "exact"
      ? fr ? `${total} ${total === 1 ? "centre permis" : "centres permis"}` : `${total} licensed ${total === 1 ? "centre" : "centres"}`
      : evidence.totalKind === "at-least"
        ? fr ? `Au moins ${total} ${total === 1 ? "centre permis" : "centres permis"}` : `At least ${total} licensed ${total === 1 ? "centre" : "centres"}`
        : fr ? `${total} ${total === 1 ? "fiche consultable" : "fiches consultables"}` : `${total} ${total === 1 ? "listing" : "listings"} available to view`,
    detail: evidence.status === "partial"
      ? fr ? "Certains résultats peuvent manquer. Réessayez ou précisez la zone." : "Some results may be missing. Retry or narrow the area."
      : fr ? "Ces fiches peuvent être incomplètes ou ne plus être à jour. Réessayez ou choisissez une autre zone." : "These listings may be incomplete or out of date. Retry or choose another area.",
    emptyTitle: fr ? "La recherche est incomplète" : "This search is incomplete",
    emptyDetail: fr ? "Aucune fiche à afficher pour le moment. Cela ne veut pas dire qu’il n’y a pas de centres dans cette zone." : "No listings are available to show right now. There may still be centres in this area.",
    retry: fr ? "Réessayer" : "Retry",
    changeArea: fr ? "Changer de zone" : "Change area",
  };
}

export function searchMapCount(pins: number, total: number, value: SearchEvidence, locale: string) {
  const coverage = searchCoverageCopy(value, locale);
  const mapped = locale === "fr" ? `${pins} centres sur la carte` : `${pins} mapped`;
  return `${mapped} · ${coverage.count(total)}`;
}

/** One gate per request channel; old filter, back-navigation and retry responses cannot win. */
export function createSearchRequestGate() {
  let identity = "";
  let revision = 0;
  return {
    select(key: string) { if (key !== identity) { identity = key; revision++; } },
    begin(key: string) { identity = key; return { key, revision: ++revision }; },
    invalidate() { revision++; },
    accepts(ticket: { key: string; revision: number }) { return ticket.key === identity && ticket.revision === revision; },
  };
}

/** Own only the loader's HTTP read, never the Router's navigation controller. */
export function createSearchLoaderRead(routerSignal?: AbortSignal) {
  const controller = new AbortController();
  const forward = () => controller.abort(routerSignal?.reason);
  if (routerSignal?.aborted) forward();
  else routerSignal?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    finish(ready: boolean) {
      routerSignal?.removeEventListener("abort", forward);
      // A paint-budget return must release the client function queue. Aborting
      // the HTTP read does not roll back background work on the server.
      if (!ready) controller.abort();
    },
  };
}
