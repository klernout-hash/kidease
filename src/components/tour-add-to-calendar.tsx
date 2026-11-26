import { CalendarPlus } from "lucide-react";
import { tourCalendarPack } from "@/lib/tour-add-to-calendar";
import { useCopy } from "@/lib/use-copy";
import type { TourRequest } from "@/lib/types";

/** .ics download and a Google Calendar link for a confirmed tour. Parent and daycare desks. */
export function TourAddToCalendar({
  tour,
  timeZone,
  location,
}: {
  tour: TourRequest;
  timeZone?: string | null;
  location?: string | null;
}) {
  const { locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const slot = tour.preferredTimes[0];
  if (tour.status !== "accepted" || !slot) return null;
  const pack = tourCalendarPack({
    tourId: tour.id,
    centreName: tour.daycareName,
    date: slot.date,
    time: slot.time,
    timeZone,
    location,
    locale: loc,
  });
  if (!pack) return null;
  const linkClass =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary ring-1 ring-border touch-manipulation hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  return (
    <div className="mt-3" data-ke="tour-add-calendar">
      <p className="text-sm text-muted">{pack.label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          className={linkClass}
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(pack.ics)}`}
          download={pack.fileName}
          data-ke="tour-ics"
        >
          <CalendarPlus className="size-4" aria-hidden />
          {loc === "fr" ? "Ajouter au calendrier" : "Add to calendar"}
        </a>
        <a className={linkClass} href={pack.google} target="_blank" rel="noopener noreferrer" data-ke="tour-google-calendar">
          {loc === "fr" ? "Agenda Google" : "Google Calendar"}
        </a>
      </div>
    </div>
  );
}
