import { useEffect, useState } from "react";
import { ChipButton } from "@/components/chip";
import { LICENCE_BUCKETS, LICENCE_LABELS, type LicenceBucket } from "@/lib/phase1-search";
import { licenceTypeFilterFlag } from "@/lib/server/phase1-flags";
import { trackProductEvent } from "@/lib/track-product-event";

/** Hidden until FEATURE_LICENCE_TYPE_FILTER is on. */
export function LicenceTypeFilters({
  locale,
  selected,
  onChange,
}: {
  locale: "en" | "fr";
  selected: LicenceBucket | null;
  onChange: (next: LicenceBucket | null) => void;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void licenceTypeFilterFlag()
      .then((value) => {
        if (live) setOn(Boolean(value));
      })
      .catch(() => {
        if (live) setOn(false);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!on) return null;
  return (
    <fieldset className="mt-3" data-ke="licence-type-filters">
      <legend className="text-sm font-medium">{locale === "fr" ? "Type de permis" : "Licence type"}</legend>
      <p className="mt-1 text-sm text-muted">
        {locale === "fr"
          ? "On montre seulement le type déjà enregistré. Inconnu reste à part."
          : "Only the stored licence type is used. Unknown stays in its own group."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {LICENCE_BUCKETS.map((bucket) => (
          <ChipButton
            key={bucket}
            on={selected === bucket}
            aria-pressed={selected === bucket}
            className="min-h-11 touch-manipulation"
            onClick={() => {
              const next = selected === bucket ? null : bucket;
              if (next) trackProductEvent("search_filter_applied", { filter_key: "licence", value_bucket: next });
              else trackProductEvent("search_filter_cleared", { filter_key: "licence" });
              onChange(next);
            }}
          >
            {LICENCE_LABELS[bucket][locale]}
          </ChipButton>
        ))}
      </div>
    </fieldset>
  );
}
