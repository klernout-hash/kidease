import { Link } from "@tanstack/react-router";
import { BuildingPhoto } from "@/components/building-photo";
import { TrustSignals } from "@/components/trust-badge";
import { listingThumb } from "@/lib/listing-photo";
import {
  formatListingAges,
  formatListingCulture,
  formatListingLanguages,
  listingIsVerified,
  listingSpotsTotal,
} from "@/lib/shortlist";
import { displayDistance } from "@/lib/units";
import { useCopy } from "@/lib/use-copy";
import { displayCentreName } from "@/lib/utils";
import type { DaycareCard } from "@/lib/types";

export function ShortlistCompareTable({
  items,
  distancesKm,
  distanceUnit,
  located,
  onRemove,
}: {
  items: DaycareCard[];
  distancesKm: Record<string, number>;
  distanceUnit: "km" | "mi";
  located: boolean;
  onRemove?: (id: string) => void;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const showCulture = items.some((d) => formatListingCulture(d.amenities, loc));

  if (items.length < 2) return null;

  return (
    <div className="mt-6 overflow-x-auto" data-shortlist-compare>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {items.map((d) => (
              <th key={d.id} className="p-2 align-bottom">
                <BuildingPhoto src={listingThumb(d.photos)} className="mb-2 aspect-[4/3] w-full rounded-lg object-cover" />
                <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-semibold hover:underline">
                  {displayCentreName(locale === "fr" ? d.nameFr : d.name)}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted">
          <tr className="border-t border-border">
            <th className="p-2 font-medium text-fg">{t("compareVerified")}</th>
            {items.map((d) => (
              <td key={d.id} className="p-2">
                <div className="flex flex-col items-start gap-1.5">
                  {listingIsVerified(d) ? (
                    <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">{t("compareVerified")}</span>
                  ) : (
                    <span>{t("trustNotVerified")}</span>
                  )}
                  <TrustSignals item={d} surface="parent" compact />
                </div>
              </td>
            ))}
          </tr>
          <CompareRow
            label={t("ages")}
            values={items.map((d) => formatListingAges(d) || t("agesUnknown"))}
          />
          <CompareRow
            label={t("hours")}
            values={items.map((d) => (locale === "fr" ? d.hoursFr || d.hours : d.hours) || t("noneListed"))}
          />
          <CompareRow
            label={t("compareDistance")}
            values={items.map((d) => {
              if (!located) return t("noneListed");
              const km = distancesKm[d.id];
              if (typeof km !== "number" || !Number.isFinite(km)) return t("noneListed");
              const n = displayDistance(km, distanceUnit);
              return `${n} ${distanceUnit === "mi" ? t("miAway") : t("kmAway")}`;
            })}
          />
          <CompareRow
            label={t("language")}
            values={items.map((d) => formatListingLanguages(d.languages, loc) || t("noneListed"))}
          />
          {showCulture ? (
            <CompareRow
              label={t("compareCulture")}
              values={items.map((d) => formatListingCulture(d.amenities, loc) || t("noneListed"))}
            />
          ) : null}
          <CompareRow
            label={t("compareSpots")}
            values={items.map((d) => {
              if (!d.availabilityKnown) return t("availUnknown");
              const spots = listingSpotsTotal(d);
              return spots > 0 ? `${spots} ${t("spots")}` : t("waitlist");
            })}
          />
          {onRemove ? (
            <tr>
              <th className="p-2" />
              {items.map((d) => (
                <td key={d.id} className="p-2">
                  <button type="button" className="min-h-11 text-sm text-muted hover:text-fg" onClick={() => onRemove(d.id)}>
                    {t("unsave")}
                  </button>
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-border">
      <th className="p-2 font-medium text-fg">{label}</th>
      {values.map((v, i) => (
        <td key={i} className="p-2">
          {v}
        </td>
      ))}
    </tr>
  );
}
