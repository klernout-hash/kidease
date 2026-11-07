import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChipButton } from "@/components/chip";
import { ListingWriter } from "@/components/listing-writer";
import { ListingTranslate } from "@/components/listing-translate";
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
import { DaycareFacilitiesPicker } from "@/components/daycare-facilities-picker";
import { MealsEditor } from "@/components/meals-editor";
import { SwitchRow } from "@/components/switch-row";
import { mealOfferingsFromStored, mealsFlagFromOfferings, type MealOfferings } from "@/lib/meal-offerings";
import { isDaycareFacility, toggleFacility } from "@/lib/daycare-facilities";
import { CARE_DETAIL_KEYS, careDetailLabel, isCareDetailKey } from "@/lib/inclusive-filters";
import { localePath } from "@/lib/locale-path";
import { inclusiveFiltersFlag } from "@/lib/server/inclusive-filters";
import { useCopy } from "@/lib/use-copy";
import { standardAgeGroup } from "@/lib/standard-age-groups";
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
  descriptionFr: string;
  partTimeMonthly: number;
  amenityKeys: string[];
  mealOfferings: MealOfferings;
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
    descriptionFr: daycare.descriptionFr ?? "",
    partTimeMonthly: daycare.partTimeMonthly ?? 0,
    amenityKeys: (daycare.amenities || "")
      .split(",")
      .map((part) => part.trim())
      .filter((key) => DESK_AMENITIES.includes(key as (typeof DESK_AMENITIES)[number]) || isCareDetailKey(key)),
    mealOfferings: mealOfferingsFromStored(daycare.mealOfferings, daycare.amenities || ""),
  };
}

function toggle<T extends string>(list: T[], token: T): T[] {
  return list.includes(token) ? list.filter((item) => item !== token) : [...list, token];
}

function defaultProgram(band: AgeProgram["band"]): AgeProgram {
  const range = standardAgeGroup(band);
  return {
    band,
    ageMinMonths: range.minMonths,
    ageMaxMonths: range.maxMonths,
    schedules: ["full"],
    monthlyFee: null,
  };
}

export function ProviderParentFields({
  value,
  onChange,
  daycareId,
  website,
  onWriterApplied,
  part,
  savedMealOfferings,
  savedAmenityKeys,
}: {
  value: ParentDeskState;
  onChange: (next: ParentDeskState) => void;
  daycareId?: string;
  website?: string | null;
  onWriterApplied?: () => void;
  /** One editor page. Omit to keep the full daycare form. */
  part?: import("@/lib/host-listing").HostParentPart;
  savedMealOfferings?: MealOfferings;
  savedAmenityKeys?: string[];
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [careDetails, setCareDetails] = useState(false);
  const show = (name: string) => !part || part === name || (part === "programs" && name === "curriculum");
  useEffect(() => {
    void inclusiveFiltersFlag()
      .then((on) => setCareDetails(Boolean(on)))
      .catch(() => setCareDetails(false));
  }, []);
  if (part === "skip") return null;

  return (
    <div className="space-y-6" data-parent-desk-fields>
      {show("facility") ? (
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
      ) : null}

      {show("policies") ? (
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
      ) : null}

      {show("policies") ? (
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
      ) : null}

      {show("programs") ? (
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
                    inputMode="decimal"
                    min={0}
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 tabular-nums"
                    value={row.monthlyFee && row.monthlyFee > 0 ? row.monthlyFee : ""}
                    placeholder={loc === "fr" ? "Inconnu" : "Unknown"}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const next = raw === "" ? null : Number(raw);
                      onChange({
                        ...value,
                        programs: value.programs.map((item) =>
                          item.band === row.band
                            ? { ...item, monthlyFee: next != null && Number.isFinite(next) && next > 0 ? next : null }
                            : item,
                        ),
                      });
                    }}
                  />
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {loc === "fr" ? "Vide = inconnu, pas gratuit." : "Blank means unknown, not free."}
                  </span>
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
            inputMode="decimal"
            min={0}
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
            value={value.partTimeMonthly > 0 ? value.partTimeMonthly : ""}
            placeholder={loc === "fr" ? "Inconnu" : "Unknown"}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === "" ? 0 : Number(raw);
              onChange({ ...value, partTimeMonthly: Number.isFinite(next) && next > 0 ? next : 0 });
            }}
          />
          <span className="mt-1 block text-xs leading-5 text-muted">
            {loc === "fr"
              ? "Laissez vide si le frais est inconnu. Zéro n’est pas gratuit."
              : "Leave blank if unknown. Zero is not free."}
          </span>
        </label>
      </fieldset>
      ) : null}

      {show("financial") ? (
      <fieldset>
        <legend className="font-display text-xl">{t("deskFinancial")}</legend>
        <p className="mt-1 text-sm text-muted">{t("deskFinancialLead")}</p>
        <div className="mt-2">
          {FINANCIAL_FLAGS.filter((id) => id !== "meals").map((id) => (
            <SwitchRow
              key={id}
              id={`financial-${id}`}
              locale={loc}
              label={
                id === "subsidy" ? t("financialSubsidy") : id === "sliding" ? t("financialSliding") : t("financialSibling")
              }
              description={
                loc === "fr"
                  ? "Activez seulement si c'est vrai pour ce centre."
                  : "Turn on only if this is true for this centre."
              }
              checked={value.financial[id]}
              onCheckedChange={(next) => onChange({ ...value, financial: { ...value.financial, [id]: next } })}
            />
          ))}
        </div>
      </fieldset>
      ) : null}

      {part === "meals" ? (
        <MealsEditor
          value={value.mealOfferings}
          saved={savedMealOfferings ?? value.mealOfferings}
          amenities={(value.amenityKeys || []).join(",")}
          locale={loc}
          onChange={(mealOfferings) => {
            const meals = mealsFlagFromOfferings(mealOfferings, value.financial.meals);
            const amenityKeys = meals
              ? value.amenityKeys.includes("meals")
                ? value.amenityKeys
                : [...value.amenityKeys, "meals"]
              : value.amenityKeys.filter((key) => key !== "meals");
            onChange({ ...value, mealOfferings, financial: { ...value.financial, meals }, amenityKeys });
          }}
        />
      ) : null}

      {show("curriculum") ? (
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
      ) : null}

      {show("safety") ? (
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
      ) : null}

      {show("amenities") ? (
      <div data-ke="editor-amenities">
        <DaycareFacilitiesPicker
          scope="centre"
          locale={loc}
          selected={value.amenityKeys}
          onToggle={(id, on) => onChange({ ...value, amenityKeys: toggleFacility(value.amenityKeys, id, on) })}
        />
        {savedAmenityKeys ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-semibold"
            data-ke="facility-cancel"
            onClick={() => {
              const kept = value.amenityKeys.filter((key) => !isDaycareFacility(key));
              const restored = savedAmenityKeys.filter((key) => isDaycareFacility(key));
              onChange({ ...value, amenityKeys: [...kept, ...restored] });
            }}
          >
            {loc === "fr" ? "Annuler les commodités" : "Cancel facility changes"}
          </button>
        ) : null}
      </div>
      ) : null}

      {careDetails && (!part || part === "amenities") ? (
        <fieldset data-ke="care-details">
          <legend className="font-display text-xl">{loc === "fr" ? "Soutien supplémentaire" : "Extra support"}</legend>
          <p className="mt-1 text-sm text-muted">
            {loc === "fr"
              ? "Cochez seulement ce que le centre offre vraiment. Les parents peuvent filtrer avec ces mots."
              : "Tick only what this centre really offers. Parents can filter with these words."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CARE_DETAIL_KEYS.filter((id) => id === "special-needs").map((id) => (
              <SwitchRow
                key={id}
                id={`care-${id}`}
                locale={loc}
                label={careDetailLabel(id, loc)}
                description={
                  loc === "fr"
                    ? "Activez seulement si le centre offre ce soutien."
                    : "Turn on only if this centre offers this support."
                }
                checked={value.amenityKeys.includes(id)}
                onCheckedChange={(next) =>
                  onChange({
                    ...value,
                    amenityKeys: next ? (value.amenityKeys.includes(id) ? value.amenityKeys : [...value.amenityKeys, id]) : value.amenityKeys.filter((key) => key !== id),
                  })
                }
              />
            ))}
          </div>
          <Link
            to={localePath("/help", locale)}
            className="mt-2 inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {loc === "fr" ? "Aide" : "Help"}
          </Link>
        </fieldset>
      ) : null}

      {!part || part === "promo" || part === "values" || part === "french" ? (
      <fieldset className="grid gap-3">
        <legend className="font-display text-xl">{part === "values" ? t("deskValues") : part === "french" ? t("about") : t("deskPromo")}</legend>
        {!part || part === "promo" ? (
          <>
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
        {daycareId ? (
          <ListingWriter
            daycareId={daycareId}
            website={website}
            onUse={(draft) => {
              const parts = [draft.description, draft.programSummary, draft.highlights.join("\n")].filter((bit) => bit.trim());
              if (!parts.length) return;
              onChange({ ...value, description: parts.join("\n\n").slice(0, 2000) });
              onWriterApplied?.();
            }}
          />
        ) : null}
        <label className="text-sm">
          {t("about")}
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-border bg-bg px-3 py-2"
            value={value.description}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
          />
        </label>
          </>
        ) : null}
        {(!part || part === "french") && daycareId ? (
          <ListingTranslate
            daycareId={daycareId}
            value={value.descriptionFr}
            onChange={(descriptionFr) => onChange({ ...value, descriptionFr })}
          />
        ) : null}
        {!part || part === "values" ? (
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
        ) : null}
      </fieldset>
      ) : null}
    </div>
  );
}
