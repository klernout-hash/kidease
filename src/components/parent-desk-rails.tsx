import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListingRail } from "@/components/listing-rail";
import { useCopy } from "@/lib/use-copy";
import { useAppStore } from "@/lib/store";
import {
  ageGroupRail,
  bestMatchRail,
  careTypeRail,
  guestFavoritesRail,
  parentRailSearchHref,
  scoreParentRailItems,
  urgencyRail,
  type ParentRailPrefs,
} from "@/lib/parent-rails";
import { CARE_TYPES, RAIL_AGES, type CareType, type RailAge } from "@/lib/care-type";
import type { CopyKey } from "@/lib/copy";
import type { Booking, Child, DaycareCard as Card } from "@/lib/types";
import { ageGroupFromMonths, monthsBetween } from "@/lib/utils";
import { soonestStartDate } from "@/lib/parent-urgency";
import { ChipButton } from "@/components/chip";

const AGE_COPY: Record<RailAge, CopyKey> = {
  infant: "infant",
  toddler: "toddler",
  preschool: "preschool",
  "school-age": "schoolAge",
};

const CARE_COPY: Record<CareType, CopyKey> = {
  centre: "careCentre",
  home: "careHome",
  "before-after": "careBeforeAfter",
};

function Chip({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <ChipButton on={on} aria-pressed={on} onClick={onClick}>
      {label}
    </ChipButton>
  );
}

export function ParentDeskRails({
  items,
  children = [],
  bookings = [],
}: {
  items: Card[];
  children?: Child[];
  bookings?: Booking[];
}) {
  const { t } = useCopy();
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const child = children[0];
  const childMonths = child?.birthdate ? monthsBetween(child.birthdate) : null;
  const defaultAge: RailAge =
    childMonths == null ? "preschool" : childMonths >= 60 ? "school-age" : ageGroupFromMonths(childMonths);
  const [age, setAge] = useState<RailAge>(defaultAge);
  const [care, setCare] = useState<CareType>("centre");

  const prefs = useMemo(() => {
    const startDate = soonestStartDate(bookings);
    const ageGroup: ParentRailPrefs["ageGroup"] = age === "school-age" ? "any" : age;
    return {
      ageGroup,
      radiusKm,
      distanceKnown: located,
      startDate,
    };
  }, [age, bookings, located, radiusKm]);

  const rails = useMemo(() => {
    const pool = scoreParentRailItems(items, prefs);
    return {
      match: bestMatchRail(pool, prefs),
      urgency: urgencyRail(pool, prefs),
      favorites: guestFavoritesRail(pool),
      age: ageGroupRail(pool, age, prefs),
      care: careTypeRail(pool, care, prefs),
    };
  }, [age, care, items, prefs]);

  if (!items.length) {
    return (
      <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
        <EmptyState title={t("noResults")} body={t("parentRailsEmptyLead")} action={t("emptyFindCare")} actionTo="/search" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <ListingRail title={t("railBestMatch")} items={rails.match} seeAllHref={parentRailSearchHref({ sort: "match" })} />
      <ListingRail title={t("railNeedSoon")} items={rails.urgency} seeAllHref={parentRailSearchHref({ sort: "urgency" })} />
      <ListingRail
        title={t("railGuestFavorites")}
        items={rails.favorites}
        seeAllHref={parentRailSearchHref({ favorites: true })}
      />
      <section className="mt-8 first:mt-4 md:mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[1.2rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
            {t("railByAge")}
          </h2>
          <a
            href={parentRailSearchHref({ age })}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("seeAll")}
          </a>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {RAIL_AGES.map((band) => (
            <Chip key={band} on={age === band} label={t(AGE_COPY[band])} onClick={() => setAge(band)} />
          ))}
        </div>
        <ListingRail title={t(AGE_COPY[age])} hideTitle className="mt-0 first:mt-0 md:mt-0" items={rails.age} />
      </section>
      <section className="mt-8 md:mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[1.2rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
            {t("railByCare")}
          </h2>
          <a
            href={parentRailSearchHref({ care })}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("seeAll")}
          </a>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {CARE_TYPES.map((kind) => (
            <Chip key={kind} on={care === kind} label={t(CARE_COPY[kind])} onClick={() => setCare(kind)} />
          ))}
        </div>
        <ListingRail title={t(CARE_COPY[care])} hideTitle className="mt-0 first:mt-0 md:mt-0" items={rails.care} />
      </section>
    </div>
  );
}
