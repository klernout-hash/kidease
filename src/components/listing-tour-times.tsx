import { useEffect, useState } from "react";
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
  }, [daycare.id]);

  return (
    <section id="listing-tours" className="scroll-mt-24" data-listing-tour-times>
      <h2 className="font-display text-2xl">{t("tourTimesPublicHint")}</h2>
      <p className="mt-1 text-sm text-muted">{timezoneLabel(timezone, loc)}</p>
      {empty ? (
        <p className="mt-3 max-w-prose text-sm text-muted" data-tour-empty={empty}>
          {empty === "none_open" ? t("tourTimesNoneOpenLead") : t("tourTimesEmptyLead")}
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
          {t("bookTour")}
        </Button>
      ) : null}
    </section>
  );
}
