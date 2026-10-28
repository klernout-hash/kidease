import { ChipButton } from "@/components/chip";
import { PIONEER_LANGS, PIONEER_LANG_LABELS, type PioneerLang, type PioneerSearch } from "@/lib/pioneer-filters";
import { useCopy } from "@/lib/use-copy";

const CHIPS: Array<{ key: keyof PioneerSearch; en: string; fr: string }> = [
  { key: "cwelcc", en: "CWELCC $10/day", fr: "AGJE 10 $/jour" },
  { key: "openings", en: "Verified openings", fr: "Places confirmées" },
  { key: "inclusive", en: "Inclusive / special needs", fr: "Inclusion / besoins particuliers" },
  { key: "meals", en: "Meals / dietary", fr: "Repas / alimentation" },
  { key: "subsidy", en: "Subsidy eligible", fr: "Subvention admissible" },
];

export function PioneerFilterRail({
  value,
  onChange,
}: {
  value: PioneerSearch;
  onChange: (next: PioneerSearch) => void;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const selected = new Set((value.lang || "").split(",").filter(Boolean));

  function toggleFlag(key: keyof PioneerSearch) {
    if (key === "lang") return;
    const on = value[key] === "1";
    onChange({ ...value, [key]: on ? undefined : "1" });
  }

  function toggleLang(code: PioneerLang) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    const lang = PIONEER_LANGS.filter((item) => next.has(item)).join(",");
    onChange({ ...value, lang: lang || undefined });
  }

  return (
    <div className="mt-2 min-w-0" data-ke="pioneer-filter-rail">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((chip) => {
          const on = value[chip.key] === "1";
          return (
            <ChipButton
              key={chip.key}
              on={on}
              className="shrink-0"
              aria-pressed={on}
              title={chip.key === "meals" ? (fr ? "Halal, casher, sans noix, végétarien, repas chauds" : "Halal, kosher, nut-free, vegetarian, hot meals") : undefined}
              onClick={() => toggleFlag(chip.key)}
            >
              {fr ? chip.fr : chip.en}
            </ChipButton>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={fr ? "Langues parlées" : "Languages spoken"}>
        {PIONEER_LANGS.map((code) => {
          const on = selected.has(code);
          const label = fr ? PIONEER_LANG_LABELS[code].fr : PIONEER_LANG_LABELS[code].en;
          return (
            <ChipButton key={code} on={on} className="shrink-0" aria-pressed={on} onClick={() => toggleLang(code)}>
              {label}
            </ChipButton>
          );
        })}
      </div>
    </div>
  );
}
