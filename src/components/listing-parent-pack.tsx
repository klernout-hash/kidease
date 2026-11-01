import { useEffect, useState } from "react";
import { amenityLabel } from "@/lib/amenities";
import {
  curriculumLabel,
  financialLabels,
  honestOpeningWindow,
  listingPrograms,
  parentOpeningLabel,
  parentScheduleLabel,
  safetyLabel,
} from "@/lib/parent-listing";
import { formatMonthlyFee, listingFeeNotes, monthlyFeeVisible, partTimeMonthlyFee } from "@/lib/public-programs";
import { standardAgeLabel } from "@/lib/standard-age-groups";
import { listingSubsidy, subsidyLabel } from "@/lib/fee-program";
import { honestVacancy } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { displayListingText, money } from "@/lib/utils";
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
  const provincial = item.provincialOpening;
  const provincialDate = provincial?.asOf ? new Date(provincial.asOf) : null;
  const provincialLabel =
    provincialDate && !Number.isNaN(provincialDate.getTime())
      ? provincialDate.toLocaleDateString(loc === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" })
      : "";
  if (provincial && provincialLabel && provincial.sourceUrl) {
    const ages = provincial.ageLabel === "All ages" ? t("provincialOpeningsAllAges") : "";
    parts.push(
      [t("provincialOpenings"), String(provincial.total), ages, t("provincialOpeningsAsOf").replace("{date}", provincialLabel)]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if (agesLabel) parts.push(agesLabel);
  const hoursText = hours.trim();
  if (hoursText && hoursText !== "—" && hoursText !== "-") parts.push(hoursText);
  const subsidy = listingSubsidy(item);
  if (feeFrom > 0) parts.push(`${t("monthlyFrom")} ${money(feeFrom, locale)}${t("month")}`);
  else if (subsidy) parts.push(subsidyLabel(subsidy, loc));
  if (!parts.length && !provincial?.sourceUrl) return null;
  return (
    <p className="mt-2 text-sm leading-5 text-fg" data-listing-header-pills>
      {parts.join(" · ")}
      {provincial?.sourceUrl ? (
        <>
          {parts.length ? " · " : null}
          <a href={provincial.sourceUrl} className="underline" rel="noreferrer" target="_blank">
            {t("dataPointSource")}
          </a>
        </>
      ) : null}
    </p>
  );
}

const JUMP_LINKS = [
  ["listing-overview", "jumpOverview"],
  ["listing-programs", "jumpPrograms"],
  ["listing-fees", "jumpFees"],
  ["listing-location", "jumpLocation"],
  ["listing-reviews", "jumpReviews"],
  ["listing-photos", "jumpPhotos"],
  ["listing-tours", "tourTimesJump"],
] as const;

export function ListingJumpNav() {
  const { t } = useCopy();
  const [active, setActive] = useState<(typeof JUMP_LINKS)[number][0]>(JUMP_LINKS[0][0]);

  useEffect(() => {
    const ids = JUMP_LINKS.map(([id]) => id);
    function pick() {
      const line = 96;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - line <= 8) current = id;
      }
      setActive(current);
    }
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);

  return (
    <nav
      className="ke-listing-jump -mx-[clamp(12px,3vw,40px)] px-[clamp(12px,3vw,40px)] lg:mx-0 lg:px-0"
      aria-label={t("jumpOverview")}
    >
      {JUMP_LINKS.map(([id, key]) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined}>
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
  const partTime = partTimeMonthlyFee(item.partTimeMonthly);
  const showPart = partTime != null;
  const confidence = listingFeeNotes(item).confidence;
  return (
    <section id="listing-programs" className="scroll-mt-24">
      <h2 className="font-display text-2xl">{t("programsTitle")}</h2>
      {rows.length || showPart ? (
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
                    <p className="font-medium">{standardAgeLabel(row.band, loc)}</p>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {row.schedules.length
                      ? row.schedules.map((id) => parentScheduleLabel(id, loc)).join(" · ")
                      : t("programsAsk")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {confidence !== "estimate" && monthlyFeeVisible(row.monthlyFee, item) && row.monthlyFee
                      ? formatMonthlyFee(row.monthlyFee, locale)
                      : t("programsAsk")}
                  </td>
                </tr>
              ))}
              {showPart && partTime ? (
                <tr key="part-time" data-program-line="part-time">
                  <td className="px-3 py-2">
                    <p className="font-medium">{t("partTimeHalfDay")}</p>
                  </td>
                  <td className="px-3 py-2 text-muted">—</td>
                  <td className="px-3 py-2 tabular-nums">
                    {confidence !== "estimate" && monthlyFeeVisible(partTime, item) ? formatMonthlyFee(partTime, locale) : t("programsAsk")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ke-empty mt-2 text-left">{t("programsAsk")}</p>
      )}
      {confidence === "estimate" ? (
        <p className="mt-2 text-sm text-muted" data-ke="fee-confidence">{t("feeProvincialEstimate")}. {t("feeProvincialEstimateLead")}</p>
      ) : null}
      {confidence === "centre" ? (
        <p className="mt-2 text-sm text-muted" data-ke="fee-confidence">{t("feeConfirmedByCentre")}. {t("feeConfirmedByCentreLead")} {t("feeNoCheckDate")}</p>
      ) : null}
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
  const promo = displayListingText(item.promoText).trim();
  const values = displayListingText(item.valuesNote).trim();
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
