import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { FacilityTypeRails } from "@/components/facility-type-rails";
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
import { RAIL_AGES, type RailAge } from "@/lib/care-type";
import type { CopyKey } from "@/lib/copy";
import type { Booking, Child, DaycareCard as Card } from "@/lib/types";
import { ageGroupFromMonths, monthsBetween } from "@/lib/utils";
import { soonestStartDate } from "@/lib/parent-urgency";
import { ChipButton } from "@/components/chip";
import { liveLookingOnly } from "@/lib/now-loops";

const AGE_COPY: Record<RailAge, CopyKey> = {
  infant: "infant",
  toddler: "toddler",
  preschool: "preschool",
  "school-age": "schoolAge",
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
  const deferredAge = useDeferredValue(age);
  const [extraReady, setExtraReady] = useState(false);

  const matchPrefs = useMemo(() => {
    const startDate = soonestStartDate(bookings);
    const ageGroup: ParentRailPrefs["ageGroup"] = defaultAge === "school-age" ? "any" : defaultAge;
    return {
      ageGroup,
      radiusKm,
      distanceKnown: located,
      startDate,
    };
  }, [defaultAge, bookings, located, radiusKm]);

  const looking = useMemo(() => liveLookingOnly(items), [items]);
  const pool = useMemo(() => scoreParentRailItems(looking, matchPrefs), [looking, matchPrefs]);

  const match = useMemo(() => bestMatchRail(pool, matchPrefs), [pool, matchPrefs]);
  const urgency = useMemo(() => urgencyRail(pool, matchPrefs), [pool, matchPrefs]);
  const favorites = useMemo(() => guestFavoritesRail(pool), [pool]);
  const ageRail = useMemo(() => {
    const agePrefs = {
      ...matchPrefs,
      ageGroup: (deferredAge === "school-age" ? "any" : deferredAge) as ParentRailPrefs["ageGroup"],
    };
    return ageGroupRail(looking, deferredAge, agePrefs);
  }, [deferredAge, looking, matchPrefs]);
  const facilityRails = useMemo(
    () => ({
      centre: careTypeRail(pool, "centre", matchPrefs),
      nursery: careTypeRail(pool, "nursery", matchPrefs),
      home: careTypeRail(pool, "home", matchPrefs),
    }),
    [matchPrefs, pool],
  );

  useEffect(() => {
    if (!looking.length) {
      setExtraReady(false);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) setExtraReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [looking.length]);

  if (!looking.length) {
    return (
      <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
        <EmptyState title={t("noResults")} body={t("parentRailsEmptyLead")} action={t("emptyFindCare")} actionTo="/search" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <ListingRail title={t("railBestMatch")} items={match} seeAllHref={parentRailSearchHref({ sort: "match" })} />
      {extraReady ? (
        <>
          <ListingRail title={t("railNeedSoon")} items={urgency} seeAllHref={parentRailSearchHref({ sort: "urgency" })} />
          <ListingRail
            title={t("railGuestFavorites")}
            items={favorites}
            seeAllHref={parentRailSearchHref({ favorites: true })}
            eagerThumbs={false}
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
                <Chip
                  key={band}
                  on={age === band}
                  label={t(AGE_COPY[band])}
                  onClick={() => setAge(band)}
                />
              ))}
            </div>
            <ListingRail
              title={t(AGE_COPY[deferredAge])}
              hideTitle
              className="mt-0 first:mt-0 md:mt-0"
              items={ageRail}
              eagerThumbs={false}
            />
          </section>
          <FacilityTypeRails rows={facilityRails} />
        </>
      ) : null}
    </div>
  );
}
