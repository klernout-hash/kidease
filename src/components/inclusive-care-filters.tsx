import { useEffect, useState } from "react";
import { ChipButton } from "@/components/chip";
import {
  CARE_DECLARATION_NOTE,
  careChipLabel,
  careChipsWhen,
  parseCareKeys,
  type CareDetailKey,
} from "@/lib/inclusive-search";
import { inclusiveFiltersFlag } from "@/lib/server/inclusive-filters";
import { trackProductEvent } from "@/lib/track-product-event";

/**
 * Diet and extra-support chips. Hidden until FEATURE_INCLUSIVE_FILTERS is on.
 */
export function InclusiveCareFilters({
  locale,
  selected,
  onChange,
}: {
  locale: "en" | "fr";
  selected: readonly string[];
  onChange: (keys: CareDetailKey[]) => void;
}) {
  const [flagOn, setFlagOn] = useState(false);
  const keys = careChipsWhen(flagOn);
  const chosen = parseCareKeys(selected.join(","));

  useEffect(() => {
    let live = true;
    void inclusiveFiltersFlag()
      .then((on) => {
        if (live) setFlagOn(Boolean(on));
      })
      .catch(() => {
        if (live) setFlagOn(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!keys.length) return null;

  function toggle(key: CareDetailKey) {
    const next = chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key];
    if (!chosen.includes(key)) trackProductEvent("inclusive_filter_applied", { key });
    onChange(parseCareKeys(next.join(",")));
  }

  return (
    <fieldset className="mt-3" data-ke="inclusive-care-filters">
      <legend className="text-sm font-medium">{locale === "fr" ? "Alimentation et soutien" : "Meals and extra support"}</legend>
      <p className="mt-1 text-sm text-muted">{CARE_DECLARATION_NOTE[locale]}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {keys.map((key) => (
          <ChipButton key={key} on={chosen.includes(key)} aria-pressed={chosen.includes(key)} className="min-h-11 touch-manipulation" onClick={() => toggle(key)}>
            {careChipLabel(key, locale)}
          </ChipButton>
        ))}
      </div>
    </fieldset>
  );
}
