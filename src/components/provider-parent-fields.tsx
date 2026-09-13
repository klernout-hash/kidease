import { ChipButton } from "@/components/chip";
import {
  CURRICULUM_TAGS,
  DESK_AMENITIES,
  FINANCIAL_FLAGS,
  OPENING_WINDOWS,
  PARENT_AGE_BANDS,
  PARENT_SCHEDULES,
  SAFETY_FEATURES,
  VALUES_NOTE_MAX,
  PROMO_TEXT_MAX,
  curriculumLabel,
  emptyFinancial,
  facilityTypeCopyKey,
  parentAgeLabel,
  parentScheduleLabel,
  safetyLabel,
  type AgeProgram,
  type ListingFinancial,
  type OpeningWindow,
  type ParentSchedule,
} from "@/lib/parent-listing";
import { FACILITY_TYPES, normalizeFacilityType, type FacilityType } from "@/lib/facility-type";
import { amenityLabel } from "@/lib/amenities";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

export type ParentDeskState = {
  facilityType: FacilityType | null;
  scheduleOptions: ParentSchedule[];
  openingWindow: OpeningWindow | null;
  programs: AgeProgram[];
  financial: ListingFinancial;
  curriculumTags: string[];
  valuesNote: string;
  safetyFeatures: string[];
  promoText: string;
  tagline: string;
  description: string;
  partTimeMonthly: number;
  amenityKeys: string[];
};

export function parentDeskFromDaycare(daycare: Daycare): ParentDeskState {
  return {
    facilityType: normalizeFacilityType(daycare.facilityType) ?? null,
    scheduleOptions: daycare.scheduleOptions ?? [],
    openingWindow: daycare.openingWindow ?? null,
    programs: daycare.programs ?? [],
    financial: daycare.financial ?? emptyFinancial(),
    curriculumTags: daycare.curriculumTags ?? [],
    valuesNote: daycare.valuesNote ?? "",
    safetyFeatures: daycare.safetyFeatures ?? [],
    promoText: daycare.promoText ?? "",
    tagline: daycare.tagline ?? "",
    description: daycare.description ?? "",
    partTimeMonthly: daycare.partTimeMonthly ?? 0,
    amenityKeys: (daycare.amenities || "")
      .split(",")
      .map((part) => part.trim())
      .filter((key) => DESK_AMENITIES.includes(key as (typeof DESK_AMENITIES)[number])),
  };
}

function toggle<T extends string>(list: T[], token: T): T[] {
  return list.includes(token) ? list.filter((item) => item !== token) : [...list, token];
}

function defaultProgram(band: AgeProgram["band"]): AgeProgram {
  const ranges = {
    infant: [0, 18],
    toddler: [18, 36],
    preschool: [30, 72],
    "school-age": [60, 144],
  } as const;
  const [ageMinMonths, ageMaxMonths] = ranges[band];
  return { band, ageMinMonths, ageMaxMonths, schedules: ["full"], monthlyFee: null };
}

export function ProviderParentFields({
  value,
  onChange,
}: {
  value: ParentDeskState;
  onChange: (next: ParentDeskState) => void;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";

  return (
    <div className="space-y-6" data-parent-desk-fields>
      <fieldset>
        <legend className="font-display text-xl">{t("deskFacility")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskFacilityLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FACILITY_TYPES.map((type) => (
            <ChipButton
              key={type}
              on={value.facilityType === type}
              aria-pressed={value.facilityType === type}
              onClick={() => onChange({ ...value, facilityType: value.facilityType === type ? null : type })}
            >
              {t(facilityTypeCopyKey(type))}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskSchedule")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskScheduleLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PARENT_SCHEDULES.map((id) => (
            <ChipButton
              key={id}
              on={value.scheduleOptions.includes(id)}
              aria-pressed={value.scheduleOptions.includes(id)}
              onClick={() => onChange({ ...value, scheduleOptions: toggle(value.scheduleOptions, id) })}
            >
              {parentScheduleLabel(id, loc)}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskOpenings")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskOpeningsLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {OPENING_WINDOWS.map((id) => (
            <ChipButton
              key={id}
              on={value.openingWindow === id}
              aria-pressed={value.openingWindow === id}
              onClick={() => onChange({ ...value, openingWindow: value.openingWindow === id ? null : id })}
            >
              {id === "immediate"
                ? t("filterOpenImmediate")
                : id === "upcoming"
                  ? t("filterOpenUpcoming")
                  : t("openingNone")}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskPrograms")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskProgramsLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PARENT_AGE_BANDS.map((band) => {
            const on = value.programs.some((row) => row.band === band);
            return (
              <ChipButton
                key={band}
                on={on}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...value,
                    programs: on
                      ? value.programs.filter((row) => row.band !== band)
                      : [...value.programs, defaultProgram(band)],
                  })
                }
              >
                {parentAgeLabel(band, loc)}
              </ChipButton>
            );
          })}
        </div>
        {value.programs.length ? (
          <div className="mt-3 space-y-3">
            {value.programs.map((row) => (
              <div key={row.band} className="grid gap-2 rounded-lg bg-bg p-3 ring-1 ring-border sm:grid-cols-4">
                <p className="sm:col-span-4 text-sm font-medium">{parentAgeLabel(row.band, loc)}</p>
                <label className="text-sm">
                  {t("ageMin")}
                  <input
                    type="number"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 tabular-nums"
                    value={row.ageMinMonths}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        programs: value.programs.map((item) =>
                          item.band === row.band ? { ...item, ageMinMonths: Number(e.target.value) } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("ageMax")}
                  <input
                    type="number"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 tabular-nums"
                    value={row.ageMaxMonths}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        programs: value.programs.map((item) =>
                          item.band === row.band ? { ...item, ageMaxMonths: Number(e.target.value) } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("programsFee")}
                  <input
                    type="number"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 tabular-nums"
                    value={row.monthlyFee ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        programs: value.programs.map((item) =>
                          item.band === row.band
                            ? { ...item, monthlyFee: Number(e.target.value) || null }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <div className="text-sm">
                  {t("deskSchedule")}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {PARENT_SCHEDULES.map((id) => (
                      <ChipButton
                        key={id}
                        on={row.schedules.includes(id)}
                        onClick={() =>
                          onChange({
                            ...value,
                            programs: value.programs.map((item) =>
                              item.band === row.band
                                ? { ...item, schedules: toggle(item.schedules, id) }
                                : item,
                            ),
                          })
                        }
                      >
                        {parentScheduleLabel(id, loc)}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <label className="mt-3 block text-sm">
          {t("partTimeFee")}
          <input
            type="number"
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
            value={value.partTimeMonthly}
            onChange={(e) => onChange({ ...value, partTimeMonthly: Number(e.target.value) })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskFinancial")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskFinancialLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FINANCIAL_FLAGS.map((id) => (
            <ChipButton
              key={id}
              on={value.financial[id]}
              aria-pressed={value.financial[id]}
              onClick={() => onChange({ ...value, financial: { ...value.financial, [id]: !value.financial[id] } })}
            >
              {id === "subsidy"
                ? t("financialSubsidy")
                : id === "sliding"
                  ? t("financialSliding")
                  : id === "sibling"
                    ? t("financialSibling")
                    : t("financialMeals")}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskCurriculum")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CURRICULUM_TAGS.map((id) => (
            <ChipButton
              key={id}
              on={value.curriculumTags.includes(id)}
              onClick={() => onChange({ ...value, curriculumTags: toggle(value.curriculumTags, id) })}
            >
              {curriculumLabel(id, loc)}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskSafety")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAFETY_FEATURES.map((id) => (
            <ChipButton
              key={id}
              on={value.safetyFeatures.includes(id)}
              onClick={() => onChange({ ...value, safetyFeatures: toggle(value.safetyFeatures, id) })}
            >
              {safetyLabel(id, loc)}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-xl">{t("deskAmenities")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESK_AMENITIES.map((id) => (
            <ChipButton
              key={id}
              on={value.amenityKeys.includes(id)}
              onClick={() => onChange({ ...value, amenityKeys: toggle(value.amenityKeys, id) })}
            >
              {amenityLabel(id, loc)}
            </ChipButton>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="font-display text-xl">{t("deskPromo")}</legend>
        <label className="text-sm">
          {t("deskTagline")}
          <input
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={value.tagline}
            maxLength={180}
            onChange={(e) => onChange({ ...value, tagline: e.target.value })}
          />
        </label>
        <label className="text-sm">
          {t("deskPromo")}
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-border bg-bg px-3 py-2"
            value={value.promoText}
            maxLength={PROMO_TEXT_MAX}
            onChange={(e) => onChange({ ...value, promoText: e.target.value })}
          />
        </label>
        <label className="text-sm">
          {t("about")}
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-border bg-bg px-3 py-2"
            value={value.description}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
          />
        </label>
        <label className="text-sm">
          {t("deskValues")}
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-border bg-bg px-3 py-2"
            value={value.valuesNote}
            maxLength={VALUES_NOTE_MAX}
            onChange={(e) => onChange({ ...value, valuesNote: e.target.value })}
          />
          <span className="mt-1 block text-xs text-muted">{t("deskValuesLead")}</span>
        </label>
      </fieldset>
    </div>
  );
}
