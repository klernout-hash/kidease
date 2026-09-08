import { useState } from "react";
import { ChipButton } from "@/components/chip";
import { Button } from "@/components/ui/button";
import {
  CULTURAL_PROGRAM_OPTIONS,
  CULTURAL_TEAM_NOTE_MAX,
  CUSTOM_SIGNAL_MAX,
  isPresetCulturalProgram,
  isPresetStaffLanguage,
  normalizeSignalToken,
  STAFF_LANGUAGE_OPTIONS,
} from "@/lib/listing-culture";
import { useCopy } from "@/lib/use-copy";

export type ListingCultureValue = {
  staffLanguages: string[];
  culturalPrograms: string[];
  culturalTeamNote: string;
};

function toggleToken(list: string[], token: string) {
  return list.includes(token) ? list.filter((item) => item !== token) : [...list, token];
}

function addCustom(list: string[], raw: string) {
  const token = normalizeSignalToken(raw);
  if (!token || list.some((item) => item.toLowerCase() === token.toLowerCase())) return list;
  return [...list, token];
}

export function ListingCultureFields({
  value,
  onChange,
}: {
  value: ListingCultureValue;
  onChange: (next: ListingCultureValue) => void;
}) {
  const { t, locale } = useCopy();
  const [languageOther, setLanguageOther] = useState("");
  const [programOther, setProgramOther] = useState("");
  const customLanguages = value.staffLanguages.filter((id) => !isPresetStaffLanguage(id));
  const customPrograms = value.culturalPrograms.filter((id) => !isPresetCulturalProgram(id));
  const noteLen = value.culturalTeamNote.length;

  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-xl">{t("languagesCulture")}</legend>
      <p className="text-sm text-muted">{t("languagesCultureLead")}</p>
      <p className="rounded-lg bg-bg px-3 py-2 text-sm text-muted ring-1 ring-border">{t("languagesCulturePrivacy")}</p>

      <div>
        <p id="staff-languages-label" className="text-sm font-medium">
          {t("staffLanguages")}
        </p>
        <p className="mt-1 text-sm text-muted">{t("staffLanguagesLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="staff-languages-label">
          {STAFF_LANGUAGE_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.id}
              on={value.staffLanguages.includes(opt.id)}
              aria-pressed={value.staffLanguages.includes(opt.id)}
              onClick={() => onChange({ ...value, staffLanguages: toggleToken(value.staffLanguages, opt.id) })}
            >
              {locale === "fr" ? opt.fr : opt.en}
            </ChipButton>
          ))}
          {customLanguages.map((token) => (
            <ChipButton
              key={token}
              on
              aria-pressed
              onClick={() => onChange({ ...value, staffLanguages: value.staffLanguages.filter((item) => item !== token) })}
            >
              {token}
            </ChipButton>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          {t("staffLanguageOther")}
          <span className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
              value={languageOther}
              maxLength={CUSTOM_SIGNAL_MAX}
              placeholder={t("staffLanguageOtherPh")}
              onChange={(e) => setLanguageOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const next = addCustom(value.staffLanguages, languageOther);
                if (next !== value.staffLanguages) {
                  onChange({ ...value, staffLanguages: next });
                  setLanguageOther("");
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const next = addCustom(value.staffLanguages, languageOther);
                if (next !== value.staffLanguages) {
                  onChange({ ...value, staffLanguages: next });
                  setLanguageOther("");
                }
              }}
            >
              {t("addOther")}
            </Button>
          </span>
        </label>
      </div>

      <div>
        <p id="cultural-programs-label" className="text-sm font-medium">
          {t("culturalPrograms")}
        </p>
        <p className="mt-1 text-sm text-muted">{t("culturalProgramsLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="cultural-programs-label">
          {CULTURAL_PROGRAM_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.id}
              on={value.culturalPrograms.includes(opt.id)}
              aria-pressed={value.culturalPrograms.includes(opt.id)}
              onClick={() => onChange({ ...value, culturalPrograms: toggleToken(value.culturalPrograms, opt.id) })}
            >
              {locale === "fr" ? opt.fr : opt.en}
            </ChipButton>
          ))}
          {customPrograms.map((token) => (
            <ChipButton
              key={token}
              on
              aria-pressed
              onClick={() => onChange({ ...value, culturalPrograms: value.culturalPrograms.filter((item) => item !== token) })}
            >
              {token}
            </ChipButton>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          {t("culturalProgramOther")}
          <span className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
              value={programOther}
              maxLength={CUSTOM_SIGNAL_MAX}
              placeholder={t("culturalProgramOtherPh")}
              onChange={(e) => setProgramOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const next = addCustom(value.culturalPrograms, programOther);
                if (next !== value.culturalPrograms) {
                  onChange({ ...value, culturalPrograms: next });
                  setProgramOther("");
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const next = addCustom(value.culturalPrograms, programOther);
                if (next !== value.culturalPrograms) {
                  onChange({ ...value, culturalPrograms: next });
                  setProgramOther("");
                }
              }}
            >
              {t("addOther")}
            </Button>
          </span>
        </label>
      </div>

      <label className="block text-sm">
        {t("culturalTeamNote")}
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2"
          value={value.culturalTeamNote}
          maxLength={CULTURAL_TEAM_NOTE_MAX}
          placeholder={t("culturalTeamNotePh")}
          onChange={(e) => onChange({ ...value, culturalTeamNote: e.target.value.slice(0, CULTURAL_TEAM_NOTE_MAX) })}
        />
        <span className="mt-1 block text-xs tabular-nums text-subtle">
          {noteLen}/{CULTURAL_TEAM_NOTE_MAX}
        </span>
      </label>
    </fieldset>
  );
}
