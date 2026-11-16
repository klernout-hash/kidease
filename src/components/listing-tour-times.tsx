import { useEffect, useState } from "react";
import { TourAssistant } from "@/components/tour-assistant";
import { tourAssistantFactsFromListing } from "@/lib/ai/tour-assistant";
import { Button } from "@/components/ui/button";
import { listPublicTourSlots } from "@/lib/server/tour-calendar";
import { useCopy } from "@/lib/use-copy";
import {
  formatTourSlotRange,
  timezoneLabel,
  type PublicTourSlot,
  type TourEmptyReason,
} from "@/lib/tour-calendar";
import type { Daycare } from "@/lib/types";

export function ListingTourTimes({
  daycare,
  onBook,
  canBook = true,
}: {
  daycare: Daycare;
  onBook: () => void;
  canBook?: boolean;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [empty, setEmpty] = useState<TourEmptyReason | null>(null);
  const [timezone, setTimezone] = useState(daycare.timezone || "America/Winnipeg");

  useEffect(() => {
    if (!canBook) return;
    let live = true;
    void listPublicTourSlots({ data: { daycareId: daycare.id } })
      .then((res) => {
        if (!live) return;
        setSlots(res.slots.slice(0, 6));
        setEmpty(res.empty);
        setTimezone(res.timezone);
      })
      .catch(() => {
        if (!live) return;
        setSlots([]);
        setEmpty("none_posted");
      });
    return () => {
      live = false;
    };
  }, [daycare.id, canBook]);

  if (!canBook) {
    return (
      <section id="listing-tours" className="scroll-mt-24" data-listing-tour-times data-tour-unclaimed>
        <h2 className="font-display text-2xl">{t("tourTimesPublicHint")}</h2>
        <p className="mt-3 max-w-prose text-sm text-muted">
          {daycare.live
            ? loc === "fr" ? "Les demandes de visite se font depuis un compte parent." : "Tour requests are available from a parent account."
            : t("tourTimesUnclaimed")}
        </p>
      </section>
    );
  }

  return (
    <section id="listing-tours" className="scroll-mt-24" data-listing-tour-times>
      <h2 className="font-display text-2xl">{t("tourTimesPublicHint")}</h2>
      <p className="mt-1 text-sm text-muted">{timezoneLabel(timezone, loc)}</p>
      {empty ? (
        <p className="mt-3 max-w-prose text-sm text-muted" data-tour-empty={empty}>
          {canBook
            ? empty === "none_open"
              ? t("tourTimesNoneOpenLead")
              : t("tourTimesEmptyLead")
            : empty === "none_open"
              ? t("tourTimesNoneOpen")
              : t("tourTimesEmpty")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>{formatTourSlotRange(slot, loc)}</span>
              <span className="shrink-0 text-xs text-muted">
                {slot.remaining === 1 ? `1 ${t("tourTimesSpotLeft")}` : `${slot.remaining} ${t("tourTimesSpotsLeft")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canBook ? (
        <Button className="mt-3" variant="secondary" onClick={onBook}>
          {t("requestTour")}
        </Button>
      ) : null}
      <TourAssistant
        daycareId={daycare.id}
        facts={tourAssistantFactsFromListing({
          centre: daycare.name,
          locale: loc,
          hours: loc === "fr" ? daycare.hoursFr || daycare.hours : daycare.hours,
          ageMinMonths: daycare.ageMinMonths,
          ageMaxMonths: daycare.ageMaxMonths,
          infantMonthly: daycare.infantMonthly,
          toddlerMonthly: daycare.toddlerMonthly,
          preschoolMonthly: daycare.preschoolMonthly,
          slots: slots
            .filter((slot) => slot.remaining > 0)
            .map((slot) => ({
              id: slot.id,
              label: formatTourSlotRange(slot, loc),
              remaining: slot.remaining,
              date: slot.date,
              time: slot.startTime,
            })),
        })}
      />
    </section>
  );
}
