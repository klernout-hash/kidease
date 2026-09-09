import {
  culturalProgramLabel,
  hasListingCulture,
  staffLanguageLabel,
} from "@/lib/listing-culture";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

export function ListingCultureCard({ daycare }: { daycare: Daycare }) {
  const { t, locale } = useCopy();
  const staffLanguages = daycare.staffLanguages ?? [];
  const culturalPrograms = daycare.culturalPrograms ?? [];
  const note = daycare.culturalTeamNote?.trim() || "";
  if (!hasListingCulture({ staffLanguages, culturalPrograms, culturalTeamNote: note })) {
    return null;
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border" aria-labelledby="languages-culture">
      <h2 id="languages-culture" className="font-display text-2xl">
        {t("languagesCulture")}
      </h2>
      {staffLanguages.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium">{t("staffLanguages")}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {staffLanguages.map((id) => (
              <li key={id} className="ke-chip">
                {staffLanguageLabel(id, locale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {culturalPrograms.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium">{t("culturalPrograms")}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {culturalPrograms.map((id) => (
              <li key={id} className="ke-chip">
                {culturalProgramLabel(id, locale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? <p className="mt-4 max-w-prose text-sm text-muted">{note}</p> : null}
    </section>
  );
}
