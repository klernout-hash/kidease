import { HEALTH_PROVINCES, summarizeCatalogueHealth, type HealthRow } from "@/lib/catalogue-health";

export function CatalogueHealthStrip({
  rows,
  publicCatalogue,
}: {
  rows: HealthRow[];
  /** Public licensed rows from the same count as /api/health. Not the review queue. */
  publicCatalogue?: number | null;
}) {
  const health = summarizeCatalogueHealth(rows);
  const publicCount = typeof publicCatalogue === "number" && publicCatalogue > 0 ? publicCatalogue : null;
  return (
    <section className="rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="catalogue-health">
      <h2 className="text-sm font-semibold">Review queue, not the public catalogue</h2>
      <p className="mt-1 text-sm text-muted">
        These counts are the centres loaded on this desk. They are not the national catalogue
        {publicCount != null ? ` (${publicCount.toLocaleString("en-CA")} public listings on /api/health)` : ""}.
        QA fixtures stay out unless that toggle is on.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        <li className="rounded-full bg-stone-100 px-3 py-1">In this queue {health.listingsTotal}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Claimed in this queue {health.claimedCount}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Licence on file {health.licenceOnFile}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Photos {health.photosConfirmed}</li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        {HEALTH_PROVINCES.map((code) => `${code} ${health.byProvince[code] ?? 0}`).join(" · ")}
      </p>
    </section>
  );
}
