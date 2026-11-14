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
import { publicMonthlyFee } from "@/lib/listing-fee";
import { formatMonthlyFee, listingFeeNotes, monthlyFeeVisible, partTimeMonthlyFee } from "@/lib/public-programs";
import { standardAgeLabel } from "@/lib/standard-age-groups";
import { honestVacancy } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { displayListingText, money } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

/** One labeled facts group; source links stay beside the figures they support. */
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
  const availability = opening
    ? parentOpeningLabel(opening, loc)
    : vacancy.kind === "open"
      ? `${vacancy.spots} ${t("spots")}`
      : t(vacancy.labelKey);
  const provincial = item.provincialOpening;
  const provincialDate = provincial?.asOf ? new Date(provincial.asOf) : null;
  const provincialLabel =
    provincialDate && !Number.isNaN(provincialDate.getTime())
      ? provincialDate.toLocaleDateString(loc === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" })
      : "";
  const provincialAges = provincial?.ageLabel === "All ages" ? t("provincialOpeningsAllAges") : "";
  const hoursText = hours.trim();
  const showHours = Boolean(hoursText && hoursText !== "—" && hoursText !== "-");
  return (
    <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-y border-border py-5 sm:grid-cols-2" data-listing-header-pills data-ke="listing-highlights">
      {agesLabel ? (
        <div>
          <dt className="text-sm text-muted">{loc === "fr" ? "Groupes d’âge" : "Age groups"}</dt>
          <dd className="mt-1 text-base font-medium">{agesLabel}</dd>
        </div>
      ) : null}
      {showHours ? (
        <div>
          <dt className="text-sm text-muted">{loc === "fr" ? "Heures" : "Hours"}</dt>
          <dd className="mt-1 text-base font-medium">{hoursText}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-sm text-muted">{t("availability")}</dt>
        <dd className="mt-1 text-base font-medium" data-ke="listing-availability">{availability}</dd>
        {provincial && provincialLabel && provincial.sourceUrl ? (
          <dd className="mt-1 text-sm text-muted">
            {t("provincialOpenings")} · {provincial.total}{provincialAges ? ` · ${provincialAges}` : ""} · {t("provincialOpeningsAsOf").replace("{date}", provincialLabel)}
            {" · "}<a href={provincial.sourceUrl} className="font-medium text-primary underline underline-offset-4" rel="noreferrer" target="_blank">{t("dataPointSource")}</a>
          </dd>
        ) : null}
      </div>
      <div>
        <dt className="text-sm text-muted">{loc === "fr" ? "Frais mensuels" : "Monthly fees"}</dt>
        <dd className={`mt-1 text-base font-medium ${feeFrom > 0 ? "text-fg" : "text-muted"}`}>
          <a href="#listing-fees" className="text-inherit underline decoration-border underline-offset-4 hover:decoration-primary">
            {feeFrom > 0 ? `${t("monthlyFrom")} ${money(feeFrom, locale)}${t("month")}` : t("programsAsk")}
          </a>
        </dd>
      </div>
    </dl>
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
  const feeKnown = (amount: number | null | undefined) =>
    confidence !== "estimate" &&
    monthlyFeeVisible(publicMonthlyFee(amount, item), item) &&
    publicMonthlyFee(amount, item) != null;
  const everyUnknown =
    rows.length > 0 &&
    rows.every((row) => !row.schedules.length && !feeKnown(row.monthlyFee)) &&
    !(showPart && feeKnown(partTime));
  if (everyUnknown) {
    const ages = rows.map((row) => standardAgeLabel(row.band, loc)).join(" · ");
    return (
      <section id="listing-programs" className="scroll-mt-24" data-ke="programs-unknown-once">
        <h2 className="font-display text-2xl">{t("programsTitle")}</h2>
        <p className="mt-2 max-w-prose text-[15px] leading-6 text-fg">{ages}</p>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted">
          {locale === "fr"
            ? "Les horaires et les frais de ces groupes ne sont pas confirmés. Demandez au centre."
            : "Schedules and fees for these age groups are not confirmed. Ask the centre."}
        </p>
      </section>
    );
  }
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
                    {confidence !== "estimate" && monthlyFeeVisible(publicMonthlyFee(row.monthlyFee, item), item) && publicMonthlyFee(row.monthlyFee, item)
                      ? formatMonthlyFee(publicMonthlyFee(row.monthlyFee, item) as number, locale)
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
                    {confidence !== "estimate" && monthlyFeeVisible(publicMonthlyFee(partTime, item), item) && publicMonthlyFee(partTime, item)
                      ? formatMonthlyFee(publicMonthlyFee(partTime, item) as number, locale)
                      : t("programsAsk")}
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
  const skip = new Set(["licensed", "funded", "unfunded", "ten-a-day", "subsidy", "open-spots"]);
  const amenities = (item.amenities || "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key && !skip.has(key))
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
