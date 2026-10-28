import { HEALTH_PROVINCES, summarizeCatalogueHealth, type HealthRow } from "@/lib/catalogue-health";

export function CatalogueHealthStrip({ rows }: { rows: HealthRow[] }) {
  const health = summarizeCatalogueHealth(rows);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80" data-ke="catalogue-health">
      <h2 className="text-sm font-semibold">Catalogue health in this queue</h2>
      <p className="mt-1 text-sm text-muted">Counts from the centres loaded here. National fee totals stay on the status page.</p>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        <li className="rounded-full bg-stone-100 px-3 py-1">Listings {health.listingsTotal}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Claimed {health.claimedCount}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Licence on file {health.licenceOnFile}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Photos {health.photosConfirmed}</li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        {HEALTH_PROVINCES.map((code) => `${code} ${health.byProvince[code] ?? 0}`).join(" · ")}
      </p>
    </section>
  );
}
