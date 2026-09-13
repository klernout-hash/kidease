import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteTourWindow,
  listCentreTourWindows,
  saveTourWindows,
  setDaycareTimezone,
} from "@/lib/server/tour-calendar";
import { useCopy } from "@/lib/use-copy";
import {
  CANADA_TOUR_TIMEZONES,
  DEFAULT_TOUR_TIMEZONE,
  formatTourSlotRange,
  remainingTourSeats,
  timezoneLabel,
  type PublicTourSlot,
} from "@/lib/tour-calendar";
import type { Daycare } from "@/lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function TourAvailabilityDesk({ listings, onSaved }: { listings: Daycare[]; onSaved?: () => void }) {
  if (listings.length === 0) return null;
  return (
    <section className="space-y-6">
      {listings.map((daycare) => (
        <TourAvailabilityForm key={daycare.id} daycare={daycare} onSaved={onSaved} />
      ))}
    </section>
  );
}

export function TourAvailabilityForm({ daycare, onSaved }: { daycare: Daycare; onSaved?: () => void }) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [timezone, setTimezone] = useState(daycare.timezone || DEFAULT_TOUR_TIMEZONE);
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:30");
  const [capacity, setCapacity] = useState(1);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await listCentreTourWindows({ data: { daycareId: daycare.id } });
    setTimezone(res.timezone);
    setSlots(res.slots);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [daycare.id]);

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border" data-tour-availability-desk>
      <h2 className="font-display text-2xl">{t("tourTimes")}</h2>
      <p className="mt-1 text-sm text-muted">{t("tourTimesLead")}</p>
      <p className="mt-1 text-sm font-medium">{locale === "fr" ? daycare.nameFr : daycare.name}</p>

      <label className="mt-4 block text-sm">
        {t("tourTimesTimezone")}
        <select
          className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {CANADA_TOUR_TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {timezoneLabel(zone, loc)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-muted">{t("tourTimesTimezoneLead")}</p>
      <Button
        type="button"
        className="mt-2"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void setDaycareTimezone({ data: { daycareId: daycare.id, timezone } })
            .then(() => {
              toast.success(t("tourTimesTimezoneSaved"));
              onSaved?.();
              return load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : t("tourTimesFailed")))
            .finally(() => setBusy(false));
        }}
      >
        {t("tourTimesSaveTimezone")}
      </Button>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void saveTourWindows({
            data: { daycareId: daycare.id, date, startTime, endTime, capacity, repeatWeekly },
          })
            .then(() => {
              toast.success(t("tourTimesAdded"));
              setRepeatWeekly(false);
              onSaved?.();
              return load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : t("tourTimesFailed")))
            .finally(() => setBusy(false));
        }}
      >
        <label className="text-sm">
          {t("tourTimesDate")}
          <input
            required
            type="date"
            min={todayIso()}
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          {t("tourTimesCapacity")}
          <input
            required
            type="number"
            min={1}
            max={12}
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          {t("tourTimesStart")}
          <input
            required
            type="time"
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="text-sm">
          {t("tourTimesEnd")}
          <input
            required
            type="time"
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={repeatWeekly}
            onChange={(e) => setRepeatWeekly(e.target.checked)}
          />
          {t("tourTimesRepeat")}
        </label>
        <Button type="submit" className="sm:col-span-2" disabled={busy} size="lg">
          {busy ? t("loading") : t("tourTimesAdd")}
        </Button>
      </form>

      <ul className="mt-5 space-y-2">
        {slots.length === 0 ? (
          <li className="rounded-lg bg-bg px-4 py-6 text-center text-sm text-muted ring-1 ring-border">
            {t("tourTimesUpcomingEmpty")}
          </li>
        ) : (
          slots.map((slot) => {
            const left = remainingTourSeats(slot.capacity, slot.booked);
            return (
              <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-3 ring-1 ring-border">
                <div>
                  <p className="text-sm font-medium">{formatTourSlotRange(slot, loc)}</p>
                  <p className="text-xs text-muted">
                    {slot.booked}/{slot.capacity} {t("tourTimesBooked")}
                    {left === 0 ? ` · ${t("tourTimesFull")}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void deleteTourWindow({ data: { windowId: slot.id } })
                      .then(() => {
                        toast.success(t("tourTimesRemoved"));
                        onSaved?.();
                        return load();
                      })
                      .catch((err) => toast.error(err instanceof Error ? err.message : t("tourTimesFailed")))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("tourTimesRemove")}
                </Button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
