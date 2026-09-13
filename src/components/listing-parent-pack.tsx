import { amenityLabel } from "@/lib/amenities";
import type { CopyKey } from "@/lib/copy";
import {
  curriculumLabel,
  financialLabels,
  honestOpeningWindow,
  listingFacilityClass,
  listingPrograms,
  parentAgeLabel,
  parentFacilityLabel,
  parentOpeningLabel,
  parentScheduleLabel,
  programFeeKnown,
  safetyLabel,
} from "@/lib/parent-listing";
import { honestVacancy } from "@/lib/now-loops";
import { publicLicenseBadge } from "@/lib/license-verify";
import { useCopy } from "@/lib/use-copy";
import { formatAgeRange, money } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

export function ListingHeaderPills({ item }: { item: Daycare }) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const vacancy = honestVacancy(item);
  const opening = honestOpeningWindow(item);
  const facility = listingFacilityClass(item);
  const license = publicLicenseBadge(item);
  const updated = item.lastVacancyUpdatedAt || item.lastPhotoUpdatedAt;
  const updatedLabel = updated
    ? new Date(updated).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
        month: "short",
        day: "numeric",
      })
    : "";
  const pill = "rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-listing-header-pills>
      <span className={`${pill} ${vacancy.kind === "open" ? "" : "text-muted"}`}>
        {opening
          ? parentOpeningLabel(opening, loc)
          : vacancy.kind === "open"
            ? `${vacancy.spots} ${t("spots")}`
            : t(vacancy.labelKey)}
      </span>
      {item.city ? <span className={pill}>{item.city}</span> : null}
      <span className={pill} data-facility-type={facility.type}>
        {parentFacilityLabel(facility.type, loc)}
      </span>
      {license ? <span className={pill}>{t(license.labelKey as CopyKey)}</span> : null}
      {updatedLabel ? (
        <span className={`${pill} text-muted`}>
          {t("updatedLabel")} {updatedLabel}
        </span>
      ) : null}
    </div>
  );
}

export function ListingJumpNav() {
  const { t } = useCopy();
  const links = [
    ["listing-programs", "jumpPrograms"],
    ["listing-tours", "tourTimesJump"],
    ["listing-reviews", "jumpReviews"],
    ["listing-photos", "jumpPhotos"],
    ["listing-location", "jumpLocation"],
    ["listing-fees", "jumpFees"],
  ] as const;
  return (
    <nav className="mt-5 flex flex-wrap gap-2 text-sm" aria-label={t("jumpPrograms")}>
      {links.map(([id, key]) => (
        <a
          key={id}
          href={`#${id}`}
          className="rounded-full bg-surface px-3 py-1.5 ring-1 ring-border hover:bg-surface-2"
        >
          {t(key)}
        </a>
      ))}
    </nav>
  );
}

export function ListingProgramsTable({ item }: { item: Daycare }) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const rows = listingPrograms(item);
  return (
    <section id="listing-programs" className="mt-8 scroll-mt-24">
      <h2 className="font-display text-2xl">{t("programsTitle")}</h2>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t("programsAge")}</th>
                <th className="px-4 py-2 font-medium">{t("chipSchedule")}</th>
                <th className="px-4 py-2 font-medium">{t("programsFee")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.band}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{parentAgeLabel(row.band, loc)}</p>
                    <p className="text-xs text-muted">{formatAgeRange(row.ageMinMonths, row.ageMaxMonths)}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.schedules.length
                      ? row.schedules.map((id) => parentScheduleLabel(id, loc)).join(" · ")
                      : t("programsAsk")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {programFeeKnown(row, item) && row.monthlyFee
                      ? money(row.monthlyFee, locale)
                      : t("programsAsk")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-surface p-4 text-sm text-muted ring-1 ring-border">{t("programsAsk")}</p>
      )}
    </section>
  );
}

export function ListingSnapshotGrid({ item }: { item: Daycare }) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const financial = financialLabels(item.financial ?? { subsidy: false, sliding: false, sibling: false, meals: false }, loc);
  const curriculum = (item.curriculumTags ?? []).map((id) => curriculumLabel(id, loc));
  const safety = (item.safetyFeatures ?? []).map((id) => safetyLabel(id, loc));
  const amenities = (item.amenities || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => amenityLabel(key, loc));
  const chips = [...new Set([...financial, ...curriculum, ...safety, ...amenities])];
  const promo = (item.promoText || "").trim();
  const values = (item.valuesNote || "").trim();
  if (!chips.length && !promo && !values) return null;
  return (
    <section className="mt-8" data-listing-snapshot>
      <h2 className="font-display text-2xl">{t("snapshotTitle")}</h2>
      {promo ? <p className="mt-2 max-w-prose text-muted">{promo}</p> : null}
      {values ? (
        <p className="mt-2 max-w-prose text-sm text-muted">
          <span className="font-medium text-fg">{t("valuesTitle")}: </span>
          {values}
        </p>
      ) : null}
      {chips.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((label) => (
            <li key={label} className="ke-chip">
              {label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
