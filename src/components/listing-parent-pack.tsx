import { amenityLabel } from "@/lib/amenities";
import {
  curriculumLabel,
  financialLabels,
  honestOpeningWindow,
  listingPrograms,
  parentAgeLabel,
  parentOpeningLabel,
  parentScheduleLabel,
  programFeeKnown,
  safetyLabel,
} from "@/lib/parent-listing";
import { confirmedStoredFeeProgram } from "@/lib/fee-program";
import { honestVacancy } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { formatAgeRange, money } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

/** Openings, ages, hours, and a starting fee. City, type, and trust stay elsewhere. */
export function ListingHeaderPills({
  item,
  agesLabel = "",
  hours = "",
  feeFrom = 0,
}: {
  item: Daycare;
  agesLabel?: string;
  hours?: string;
  feeFrom?: number;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const vacancy = honestVacancy(item);
  const opening = honestOpeningWindow(item);
  const parts: string[] = [];
  if (opening) parts.push(parentOpeningLabel(opening, loc));
  else if (vacancy.kind === "open") parts.push(`${vacancy.spots} ${t("spots")}`);
  else if (vacancy.kind === "waitlist" || vacancy.kind === "confirm") parts.push(t(vacancy.labelKey));
  if (agesLabel) parts.push(`${t("ages")} ${agesLabel}`);
  const hoursText = hours.trim();
  if (hoursText && hoursText !== "—" && hoursText !== "-") parts.push(hoursText);
  if (feeFrom > 0) parts.push(`${t("monthlyFrom")} ${money(feeFrom, locale)}${t("month")}`);
  else if (confirmedStoredFeeProgram(item) === "mb-10-day") parts.push(t("cardTenPerDay"));
  if (!parts.length) return null;
  return (
    <p className="mt-2 text-sm leading-5 text-fg" data-listing-header-pills>
      {parts.join(" · ")}
    </p>
  );
}

export function ListingJumpNav() {
  const { t } = useCopy();
  const links = [
    ["listing-overview", "jumpOverview"],
    ["listing-programs", "jumpPrograms"],
    ["listing-fees", "jumpFees"],
    ["listing-location", "jumpLocation"],
    ["listing-reviews", "jumpReviews"],
    ["listing-photos", "jumpPhotos"],
    ["listing-tours", "tourTimesJump"],
  ] as const;
  return (
    <nav
      className="ke-listing-jump -mx-[clamp(12px,3vw,40px)] px-[clamp(12px,3vw,40px)] lg:mx-0 lg:px-0"
      aria-label={t("jumpOverview")}
    >
      {links.map(([id, key]) => (
        <a key={id} href={`#${id}`}>
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
    <section id="listing-programs" className="scroll-mt-24">
      <h2 className="font-display text-2xl">{t("programsTitle")}</h2>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">{t("programsAge")}</th>
                <th className="px-3 py-1.5 font-medium">{t("chipSchedule")}</th>
                <th className="px-3 py-1.5 font-medium">{t("programsFee")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.band}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{parentAgeLabel(row.band, loc)}</p>
                    <p className="text-xs text-muted">{formatAgeRange(row.ageMinMonths, row.ageMaxMonths)}</p>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {row.schedules.length
                      ? row.schedules.map((id) => parentScheduleLabel(id, loc)).join(" · ")
                      : t("programsAsk")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
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
        <p className="ke-empty mt-2 text-left">{t("programsAsk")}</p>
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
    <section data-listing-snapshot>
      <h2 className="font-display text-2xl">{t("snapshotTitle")}</h2>
      {promo ? <p className="mt-2 max-w-prose text-muted">{promo}</p> : null}
      {values ? (
        <p className="mt-2 max-w-prose text-sm text-muted">
          <span className="font-medium text-fg">{t("valuesTitle")}: </span>
          {values}
        </p>
      ) : null}
      {chips.length ? <p className="mt-3 max-w-prose text-sm leading-6 text-fg">{chips.join(" · ")}</p> : null}
    </section>
  );
}
