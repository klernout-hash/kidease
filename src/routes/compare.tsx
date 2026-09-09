import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { BuildingPhoto } from "@/components/building-photo";
import { listingThumb } from "@/lib/listing-photo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { getDaycaresByIds } from "@/lib/server/daycares";
import { clearCompare, compareKeysFromSearch, readCompare, toggleCompareItem } from "@/lib/compare";
import {
  canShowMatchScore,
  confirmedFeeProgramBadge,
  honestVacancy,
  parseCompareSlugs,
} from "@/lib/now-loops";
import { hasRealPhoto } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import { vacancyLine } from "@/components/vacancy-freshness";
import { parentIncompleteLabel } from "@/components/listing-completeness";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";
import { parentMatchScore } from "@/lib/parent-match";
import { parentUrgencyScore } from "@/lib/parent-urgency";
import { useAppStore } from "@/lib/store";
import { distanceKm } from "@/lib/proximity";
import {
  formatListingAges,
  formatListingCulture,
  formatListingLanguages,
  listingIsVerified,
} from "@/lib/shortlist";
import { displayDistance } from "@/lib/units";
import { TrustSignals } from "@/components/trust-badge";
import { money } from "@/lib/utils";
import { licenseRegistryUrl } from "@/lib/licensing";
import type { DaycareCard } from "@/lib/types";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/compare")({
  validateSearch: (s: Record<string, unknown>) => ({
    slugs: parseCompareSlugs(s.slugs),
  }),
  head: () => pageSeoHead(MARKETING_PAGE_SEO.compare),
  component: ComparePage,
});

function ComparePage() {
  const { t, locale } = useCopy();
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const ageGroup = useAppStore((s) => s.ageGroup);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const incoming = Route.useSearch();
  const [items, setItems] = useState<DaycareCard[]>([]);

  useEffect(() => {
    const keys = compareKeysFromSearch(incoming.slugs, readCompare());
    if (!keys.length) {
      setItems([]);
      return;
    }
    void getDaycaresByIds({ data: keys }).then(setItems).catch(() => setItems([]));
  }, [incoming.slugs]);

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-6xl py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl">{t("compareTitle")}</h1>
            {items.length ? <p className="mt-2 text-muted">{t("compareEmpty")}</p> : null}
          </div>
          {items.length ? (
            <Button variant="secondary" onClick={() => { clearCompare(); setItems([]); }}>
              {t("clearCompare")}
            </Button>
          ) : null}
        </div>
        {items.length ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2" />
                  {items.map((d) => (
                    <th key={d.id} className="p-2 align-bottom">
                      <BuildingPhoto src={listingThumb(d.photos)} className="mb-2 aspect-[4/3] w-full rounded-lg object-cover" />
                      <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-semibold hover:underline">
                        {locale === "fr" ? d.nameFr : d.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-muted">
                <tr className="border-t border-border">
                  <th className="p-2 font-medium text-fg">{t("compareTrust")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <TrustSignals item={d} surface="parent" compact />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border">
                  <th className="p-2 font-medium text-fg">{t("matchScore")}</th>
                  {items.map((d) => {
                    const km = distanceKm(origin, { lat: d.lat, lng: d.lng });
                    const score = canShowMatchScore(d)
                      ? parentMatchScore(
                          { ...d, distanceKm: km },
                          { ageGroup, radiusKm, distanceKnown: located },
                        )
                      : undefined;
                    return (
                      <td key={d.id} className="p-2">
                        <MatchCue score={score} />
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-border">
                  <th className="p-2 font-medium text-fg">{t("urgencyScore")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <UrgencyCue score={parentUrgencyScore(d, { ageGroup })} showZero />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border">
                  <th className="p-2 font-medium text-fg">{t("guestFavorite")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      {d.guestFavorite ? <GuestFavoriteBadge item={d} compact /> : t("qualityNotFavorite")}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border">
                  <th className="p-2 font-medium text-fg">{t("compareVerified")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      {listingIsVerified(d) ? t("compareVerified") : t("trustNotVerified")}
                    </td>
                  ))}
                </tr>
                <Row label={t("cityLabel")} values={items.map((d) => d.city)} />
                <Row
                  label={t("ages")}
                  values={items.map((d) => formatListingAges(d) || t("agesUnknown"))}
                />
                <Row label={t("hours")} values={items.map((d) => d.hours || t("noneListed"))} />
                <Row
                  label={t("compareDistance")}
                  values={items.map((d) => {
                    if (!located) return t("noneListed");
                    const km = distanceKm(origin, { lat: d.lat, lng: d.lng });
                    if (!Number.isFinite(km)) return t("noneListed");
                    return `${displayDistance(km, distanceUnit)} ${distanceUnit === "mi" ? t("miAway") : t("kmAway")}`;
                  })}
                />
                <Row
                  label={t("language")}
                  values={items.map((d) => formatListingLanguages(d.languages, locale === "fr" ? "fr" : "en") || t("noneListed"))}
                />
                <Row
                  label={t("compareCulture")}
                  values={items.map((d) => formatListingCulture(d.amenities, locale === "fr" ? "fr" : "en") || t("noneListed"))}
                />
                <Row
                  label={t("compareFeesCwelcc")}
                  values={items.map((d) => {
                    const badge = confirmedFeeProgramBadge(d);
                    if (badge) return t(badge);
                    return d.fromPrice > 0 ? money(d.fromPrice, locale) : t("cardGapFees");
                  })}
                />
                <Row
                  label={t("comparePhoto")}
                  values={items.map((d) => (hasRealPhoto(d) ? t("detailsReady") : t("cardGapPhoto")))}
                />
                <Row
                  label={t("compareVacancy")}
                  values={items.map((d) => {
                    const vacancy = honestVacancy(d);
                    if (vacancy.kind === "open") return `${vacancy.spots} ${t("spots")}`;
                    return t(vacancy.labelKey);
                  })}
                />
                <Row
                  label={t("availability")}
                  values={items.map((d) => {
                    const vacancy = honestVacancy(d);
                    if (vacancy.kind === "open") return `${vacancy.spots} ${t("spots")}`;
                    return t(vacancy.labelKey);
                  })}
                />
                <Row
                  label={t("spotsUpdated")}
                  values={items.map((d) => {
                    const line = vacancyLine(d, t, locale);
                    if (line.kind === "unknown") return t("availUnknown");
                    return line.kind === "stale" ? line.detail || line.text : line.text;
                  })}
                />
                <Row
                  label={t("detailsIncomplete")}
                  values={items.map((d) => parentIncompleteLabel(d, t) ?? t("detailsReady"))}
                />
                <Row label={t("googleReviews")} values={items.map((d) => (d.reviewCount ? `${(d.ratingX10 / 10).toFixed(1)} (${d.reviewCount})` : "—"))} />
                <Row label={t("license")} values={items.map((d) => d.licenseNumber ?? "—")} />
                <tr>
                  <th className="p-2 text-fg">{t("license")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <a href={licenseRegistryUrl(d.province)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {t("viewLicenceRecord")}
                      </a>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="p-2" />
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <button type="button" className="text-sm text-muted hover:text-fg" onClick={() => { toggleCompareItem({ id: d.id, slug: d.slug }); setItems((rows) => rows.filter((r) => r.id !== d.id)); }}>
                        {t("clearCompare")}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-10 rounded-xl bg-surface ring-1 ring-border">
            <EmptyState title={t("noCompare")} body={t("compareEmpty")} action={t("emptyFindCare")} actionTo="/search" />
          </div>
        )}
      </main>
      <SiteFooter />
    </Shell>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-border">
      <th className="p-2 font-medium text-fg">{label}</th>
      {values.map((v, i) => (
        <td key={i} className="p-2">{v}</td>
      ))}
    </tr>
  );
}
