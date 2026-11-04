import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { toast } from "sonner";
import { AgeOpenSpotsDesk } from "@/components/age-open-spots-desk";
import { CapacityForm } from "@/components/provider-listing-forms";
import { SpotOfferDesk } from "@/components/spot-offer-desk";
import { TourAvailabilityDesk } from "@/components/tour-availability-desk";
import { Button } from "@/components/ui/button";
import { WaitlistPulseButton } from "@/components/waitlist-pulse-button";
import {
  centreDateISO,
  holidayOn,
  isIsoMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  spotTotal,
  weekdayLabels,
  type SpotCounts,
} from "@/lib/host-calendar";
import { fillCount, hostCopy } from "@/lib/host-listing-copy";
import { loadHostCalendar, saveHostCalendarDay, type HostCalendarDay, type HostCalendarPayload } from "@/lib/server/host-calendar";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

type Gear = "spots" | "closures" | "tours" | "waitlist";

export function HostCalendarDesk({
  listings,
  onSaved,
}: {
  listings: Daycare[];
  onSaved: () => void | Promise<void>;
}) {
  const { locale } = useCopy();
  const copy = hostCopy(locale);
  const [centreId, setCentreId] = useState(listings[0]?.id ?? "");
  const centre = listings.find((row) => row.id === centreId) ?? listings[0];
  const [month, setMonth] = useState(() => monthOf(centreDateISO(centre?.timezone, new Date())));
  const [payload, setPayload] = useState<HostCalendarPayload | null>(null);
  const [gear, setGear] = useState<Gear | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadedId = centre?.id ?? "";
  useEffect(() => {
    if (!loadedId) return;
    let live = true;
    setError(null);
    void loadHostCalendar({ data: { daycareId: loadedId, month } })
      .then((row) => {
        if (!live) return;
        setPayload(row);
        if (isIsoMonth(row.month) && row.month !== month) setMonth(row.month);
      })
      .catch(() => {
        if (live) setError(copy.saveFailed);
      });
    return () => {
      live = false;
    };
  }, [loadedId, month, copy.saveFailed]);

  if (!centre) {
    return <p className="text-sm text-muted">{copy.emptyListings}</p>;
  }

  const today = payload?.today ?? centreDateISO(centre.timezone);
  const standing = payload?.standing ?? {
    infant: centre.spotsInfant,
    toddler: centre.spotsToddler,
    preschool: centre.spotsPreschool,
  };
  const byDay = new Map((payload?.days ?? []).map((row) => [row.day, row]));
  const cells = monthGrid(month);
  const labels = weekdayLabels(locale);
  const title = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="space-y-4" data-ke="host-calendar">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted">{copy.calendarLead}</p>
          <p className="mt-1 text-sm text-muted">{copy.parentsSee}</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full ring-1 ring-border touch-manipulation"
          aria-label={copy.gear}
          aria-expanded={gear != null}
          onClick={() => setGear((current) => (current ? null : "spots"))}
        >
          <Settings className="size-5" aria-hidden />
        </button>
      </div>
      {listings.length > 1 ? (
        <label className="block text-sm">
          {copy.pickCentre}
          <select
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
            value={centre.id}
            onChange={(event) => {
              setCentreId(event.target.value);
              setSelected(null);
            }}
          >
            {listings.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-medium">{centre.name}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation" aria-label={copy.prevMonth} onClick={() => setMonth((value) => shiftMonth(value, -1))}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button type="button" className="min-h-11 px-3 text-sm font-medium touch-manipulation" onClick={() => setMonth(monthOf(today))}>
          {copy.thisMonth}
        </button>
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation" aria-label={copy.nextMonth} onClick={() => setMonth((value) => shiftMonth(value, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div role="grid" aria-label={title} className="w-full">
        <div role="row" className="grid grid-cols-7 text-center text-xs text-muted">
          {labels.map((label, index) => (
            <div key={`${label}-${index}`} role="columnheader" className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell.inMonth) return <div key={`blank-${index}`} />;
            const row = byDay.get(cell.date);
            const closed = Boolean(row?.closed);
            const spots = row
              ? spotTotal(row, closed)
              : spotTotal(standing);
            const holiday = holidayOn(cell.date, centre.province);
            const enrol = payload?.enrolments[cell.date] ?? 0;
            const tours = payload?.tours[cell.date] ?? 0;
            const detail = [
              closed ? copy.closed : fillCount(copy.spotsCount, spots),
              enrol ? `${enrol} ${copy.enrolments}` : "",
              tours ? `${tours} ${copy.toursBar}` : "",
              holiday ? holiday[locale === "fr" ? "fr" : "en"] : "",
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                data-ke="host-day"
                aria-current={cell.date === today ? "date" : undefined}
                aria-label={copy.dayLabel.replace("{date}", cell.date).replace("{detail}", detail)}
                className={cn(
                  "flex min-h-11 flex-col rounded-lg bg-surface px-1 py-1 text-left ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  cell.date === today && "ring-2 ring-primary",
                  selected === cell.date && "bg-primary/10",
                )}
                onClick={() => setSelected(cell.date)}
              >
                <span className="text-xs tabular-nums">{Number(cell.date.slice(8))}</span>
                <span className={cn("text-[11px] tabular-nums", row ? "font-medium text-fg" : "text-muted")}>{closed ? copy.closed : spots}</span>
                <span className="mt-auto flex gap-0.5" aria-hidden>
                  {enrol > 0 ? <span className="h-1 flex-1 rounded-full bg-ok" /> : null}
                  {tours > 0 ? <span className="h-1 flex-1 rounded-full bg-primary" /> : null}
                  {closed || holiday ? <span className="h-1 flex-1 rounded-full bg-danger" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <ul className="flex flex-wrap gap-3 text-xs text-muted">
        <li className="inline-flex items-center gap-1"><span className="h-1 w-4 rounded-full bg-ok" aria-hidden />{copy.enrolments}</li>
        <li className="inline-flex items-center gap-1"><span className="h-1 w-4 rounded-full bg-primary" aria-hidden />{copy.toursBar}</li>
        <li className="inline-flex items-center gap-1"><span className="h-1 w-4 rounded-full bg-danger" aria-hidden />{copy.closureBar}</li>
      </ul>
      {selected ? (
        <DayEditor
          daycareId={centre.id}
          day={selected}
          saved={byDay.get(selected) ?? null}
          standing={standing}
          province={centre.province}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            const next = await loadHostCalendar({ data: { daycareId: centre.id, month } });
            setPayload(next);
            await onSaved();
          }}
        />
      ) : null}
      {gear ? (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="host-calendar-gear">
          <div role="tablist" aria-label={copy.gear} className="flex flex-wrap gap-1">
            {(
              [
                ["spots", copy.spotsByAge],
                ["closures", copy.closures],
                ["tours", copy.tours],
                ["waitlist", copy.waitlist],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={gear === id}
                className={cn("min-h-11 rounded-full px-3 text-sm touch-manipulation", gear === id ? "bg-fg text-bg" : "ring-1 ring-border")}
                onClick={() => setGear(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {gear === "spots" ? (
              <>
                <CapacityForm daycare={centre} mode="listing" focus="ages" onSaved={() => void onSaved()} />
                <AgeOpenSpotsDesk listings={listings.map((row) => ({ id: row.id, name: row.name }))} />
              </>
            ) : null}
            {gear === "closures" ? (
              <ul className="space-y-2 text-sm">
                {(payload?.closures.length ?? 0) === 0 ? <li className="text-muted">{copy.noClosures}</li> : null}
                {payload?.closures.map((day) => (
                  <li key={day} className="flex items-center justify-between gap-2">
                    <span className="tabular-nums">{day}</span>
                    <span>{copy.closed}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {gear === "tours" ? <TourAvailabilityDesk listings={listings} onSaved={() => void onSaved()} /> : null}
            {gear === "waitlist" ? (
              <div className="space-y-3">
                <p className="text-sm">{fillCount(copy.waitlistSummary, payload?.waitlistCount ?? 0)}</p>
                <WaitlistPulseButton daycareId={centre.id} onPulsed={onSaved} />
                <SpotOfferDesk />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DayEditor({
  daycareId,
  day,
  saved,
  standing,
  province,
  onClose,
  onSaved,
}: {
  daycareId: string;
  day: string;
  saved: HostCalendarDay | null;
  standing: SpotCounts;
  province: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useCopy();
  const copy = hostCopy(locale);
  const start = saved ?? { ...standing, day, closed: false };
  const [infant, setInfant] = useState(String(start.infant));
  const [toddler, setToddler] = useState(String(start.toddler));
  const [preschool, setPreschool] = useState(String(start.preschool));
  const [closed, setClosed] = useState(start.closed);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedDay, setLoadedDay] = useState(day);
  if (day !== loadedDay) {
    setLoadedDay(day);
    setInfant(String(start.infant));
    setToddler(String(start.toddler));
    setPreschool(String(start.preschool));
    setClosed(start.closed);
    setOffer(false);
    setMessage(null);
  }
  const holiday = holidayOn(day, province);

  const fields = useMemo(
    () =>
      [
        ["infant", infant, setInfant],
        ["toddler", toddler, setToddler],
        ["preschool", preschool, setPreschool],
      ] as const,
    [infant, toddler, preschool],
  );

  return (
    <form
      className="rounded-2xl bg-surface p-4 ring-1 ring-border"
      data-ke="host-day-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage(null);
        void saveHostCalendarDay({
          data: {
            daycareId,
            day,
            infant: Number(infant) || 0,
            toddler: Number(toddler) || 0,
            preschool: Number(preschool) || 0,
            closed,
          },
        })
          .then(async (result) => {
            if (!result.ok) {
              setMessage(copy.saveFailed);
              return;
            }
            setOffer(result.offerNotify);
            await onSaved();
          })
          .catch((err) => {
            const text = err instanceof Error ? err.message : copy.saveFailed;
            setMessage(text);
            toast.error(text);
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl">{day}</h3>
        <button type="button" className="min-h-11 px-2 text-sm touch-manipulation" onClick={onClose}>
          {t("back")}
        </button>
      </div>
      {holiday ? <p className="mt-1 text-sm text-muted">{holiday[locale === "fr" ? "fr" : "en"]}</p> : null}
      <p className="mt-1 text-sm text-muted">{saved ? copy.savedDay : copy.standing}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {fields.map(([key, value, setValue]) => (
          <label key={key} className="text-sm">
            {key === "infant" ? t("spotsInfant") : key === "toddler" ? t("spotsToddler") : t("spotsPreschool")}
            <input
              type="number"
              min={0}
              max={200}
              inputMode="numeric"
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={closed} onChange={(event) => setClosed(event.target.checked)} />
        {copy.markClosed}
      </label>
      <Button type="submit" className="mt-3" disabled={busy}>
        {copy.saveDay}
      </Button>
      {message ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      ) : null}
      {offer ? (
        <div className="mt-3 rounded-xl bg-bg p-3 ring-1 ring-border" data-ke="host-notify-offer">
          <p className="text-sm">{copy.notifyOffer}</p>
          <div className="mt-2">
            <WaitlistPulseButton daycareId={daycareId} compact />
          </div>
        </div>
      ) : null}
    </form>
  );
}
