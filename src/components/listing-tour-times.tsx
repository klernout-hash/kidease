import { useEffect, useState } from "react";
import { TourAssistant } from "@/components/tour-assistant";
import { TourCountSummary } from "@/components/tour-count-summary";
import { tourAssistantFactsFromListing } from "@/lib/ai/tour-assistant";
import { Button } from "@/components/ui/button";
import { listPublicTourSlots } from "@/lib/server/tour-calendar";
import { summarizeTourCounts } from "@/lib/tour-counts";
import { useCopy } from "@/lib/use-copy";
import { RuntimePaused } from "@/components/runtime-paused";
import { useRuntimeSwitches } from "@/lib/use-runtime-switches";
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
  const tourBooking = useRuntimeSwitches().tourBooking;
  const loc = locale === "fr" ? "fr" : "en";
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [ready, setReady] = useState(false);
  const [empty, setEmpty] = useState<TourEmptyReason | null>(null);
  const [timezone, setTimezone] = useState(daycare.timezone || "America/Winnipeg");

  useEffect(() => {
    // Read posted times even when this viewer cannot book, so the copy matches real slots (B04).
    let live = true;
    void listPublicTourSlots({ data: { daycareId: daycare.id } })
      .then((res) => {
        if (!live) return;
        setSlots(res.slots);
        setEmpty(res.empty);
        setTimezone(res.timezone);
        setReady(true);
      })
      .catch(() => {
        if (!live) return;
        setSlots([]);
        setEmpty("none_posted");
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [daycare.id]);

  if (!canBook) {
    const open = slots.filter((slot) => slot.remaining > 0);
    return (
      <section id="listing-tours" className="scroll-mt-24" data-listing-tour-times data-tour-unclaimed={open.length ? undefined : ""}>
        <h2 className="font-display text-2xl">{t("tourTimesPublicHint")}</h2>
        {open.length ? (
          <ul className="mt-3 divide-y divide-border" data-ke="listing-tour-times-readonly">
            {open.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>{formatTourSlotRange(slot, loc)}</span>
                <span className="shrink-0 text-xs text-muted">
                  {slot.remaining === 1 ? `1 ${t("tourTimesSpotLeft")}` : `${slot.remaining} ${t("tourTimesSpotsLeft")}`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 max-w-prose text-sm text-muted">
          {open.length || daycare.live
            ? loc === "fr" ? "Les demandes de visite se font depuis un compte parent." : "Tour requests are available from a parent account."
            : ready
              ? t("tourTimesUnclaimed")
              : null}
        </p>
      </section>
    );
  }

  return (
    <section id="listing-tours" className="scroll-mt-24" data-listing-tour-times>
      <h2 className="font-display text-2xl">{t("tourTimesPublicHint")}</h2>
      <p className="mt-1 text-sm text-muted">{timezoneLabel(timezone, loc)}</p>
      {ready ? (
        <div className="mt-3">
          <TourCountSummary counts={summarizeTourCounts({ slots })} locale={loc} />
        </div>
      ) : null}
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
      {canBook && !tourBooking ? <div className="mt-3"><RuntimePaused id="tourBooking" compact /></div> : null}
      {canBook && tourBooking ? (
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
