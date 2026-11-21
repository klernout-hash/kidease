import { HEALTH_PROVINCES, summarizeCatalogueHealth, type HealthRow } from "@/lib/catalogue-health";
import { useCopy } from "@/lib/use-copy";

export function CatalogueHealthStrip({
  rows,
  publicCatalogue,
}: {
  rows: HealthRow[];
  /** Public licensed rows from the same count as /api/health. Not the review queue. */
  publicCatalogue?: number | null;
}) {
  const { t, locale } = useCopy();
  const health = summarizeCatalogueHealth(rows);
  const publicCount = typeof publicCatalogue === "number" && publicCatalogue > 0 ? publicCatalogue : null;
  const numberLocale = locale === "fr" ? "fr-CA" : "en-CA";
  return (
    <section className="rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="catalogue-health">
      <h2 className="text-sm font-semibold">{t("catalogueQueueTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("catalogueQueueLead")}</p>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {publicCount != null ? (
          <li className="rounded-full bg-stone-100 px-3 py-1 font-semibold" data-ke="catalogue-public">
            {t("cataloguePublicPill")} {publicCount.toLocaleString(numberLocale)}
          </li>
        ) : null}
        <li className="rounded-full bg-stone-100 px-3 py-1">{t("catalogueInQueue")} {health.listingsTotal}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">{t("catalogueClaimedQueue")} {health.claimedCount}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Licence on file {health.licenceOnFile}</li>
        <li className="rounded-full bg-stone-100 px-3 py-1">Photos {health.photosConfirmed}</li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        {HEALTH_PROVINCES.map((code) => `${code} ${health.byProvince[code] ?? 0}`).join(" · ")}
      </p>
    </section>
  );
}
