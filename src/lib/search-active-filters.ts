import type { CopyKey } from "./copy.ts";
import { CARE_DETAIL_LABELS, isCareDetailKey } from "./inclusive-filters.ts";
import { LICENCE_LABELS, type LicenceBucket } from "./phase1-search.ts";
import { PIONEER_LANG_LABELS, type PioneerLang } from "./pioneer-filters.ts";
import type { ActiveSearchFilter } from "./saved-search.ts";

const FLAG_COPY: Record<Extract<ActiveSearchFilter, { kind: "flag" }>["key"], CopyKey | "infant"> = {
  ten: "filterTen",
  meals: "filterMeals",
  outdoor: "filterOutdoor",
  extended: "filterExtended",
  infantOnly: "infant",
  catchmentOnly: "filterCatchment",
  confirmedOnly: "filterConfirmedSpots",
  readyOnly: "filterDetailsReady",
  claimVerifiedOnly: "filterClaimVerified",
};

const AVAIL_COPY: Record<string, CopyKey> = {
  open: "filterOpen",
  waitlist: "filterWaitlist",
  unknown: "filterUnknown",
};

const PIONEER_COPY = {
  cwelcc: { en: "Fee-cap program", fr: "Programme à tarif plafonné" },
  meals: { en: "Meals / dietary", fr: "Repas / alimentation" },
  subsidy: { en: "Subsidy eligible", fr: "Subvention admissible" },
} as const;

/** Plain label for one active filter chip. */
export function activeFilterLabel(
  item: ActiveSearchFilter,
  locale: "en" | "fr",
  t: (key: CopyKey) => string,
): string {
  const fr = locale === "fr";
  switch (item.kind) {
    case "avail":
      return AVAIL_COPY[item.value] ? t(AVAIL_COPY[item.value]!) : item.value;
    case "flag": {
      const key = FLAG_COPY[item.key];
      return key === "infant" ? t("infant") : t(key);
    }
    case "favorites":
      return t("filterFavorites");
    case "careType":
      return fr ? "Type de service" : "Care type";
    case "facility":
      return fr ? "Type d’établissement" : "Facility type";
    case "pioneer":
      return PIONEER_COPY[item.key][locale];
    case "support":
      return fr ? "Inclusion / besoins particuliers" : "Inclusive / special needs";
    case "spoken": {
      const label = PIONEER_LANG_LABELS[item.code as PioneerLang];
      return label ? label[locale] : item.code;
    }
    case "diet":
      return isCareDetailKey(item.key) ? CARE_DETAIL_LABELS[item.key][locale] : item.key;
    case "licence": {
      const label = LICENCE_LABELS[item.value as LicenceBucket];
      return label ? label[locale] : item.value;
    }
  }
}

/** Filters that only match what a centre has told us (diet and extra support). */
export function declaredDetailFilters(items: readonly ActiveSearchFilter[]): ActiveSearchFilter[] {
  return items.filter((item) => item.kind === "support" || item.kind === "diet");
}
