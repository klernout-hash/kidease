import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  eventsFromTours,
  eventsOnDay,
  monthCells,
  tourReminderPlan,
  type CalendarEvent,
} from "@/lib/desk-features";
import { buildTourIcs } from "@/lib/tour-ics";
import { loadDeskFeatureFlags } from "@/lib/server/desk-features";
import { listTourRequests } from "@/lib/server/tours";
import { saveTourVisitReminder } from "@/lib/server/tour-calendar";
import { useCopy } from "@/lib/use-copy";

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function downloadIcs(event: CalendarEvent) {
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const text = buildTourIcs({
    uid: event.tourId,
    title: `Tour: ${event.title}`,
    start,
    end,
    location: event.location,
    description: "KidEase visit. This file does not email anyone.",
  });
  const blob = new Blob([text], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kidease-tour.ics";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Parent page, and the daycare tour desk when the flag is on.
 * When the flag is off, parents see a way home. Daycares see nothing extra.
 */
export function TourCalendarPage({ audience }: { audience: "parent" | "provider" }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setEnabled(flags.tourCalendar))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void listTourRequests({ data: { desk: audience === "provider" ? "centre" : "parent" } })
      .then((rows) => setEvents(eventsFromTours(rows)))
      .catch(() => setEvents([]));
  }, [audience, enabled]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const day = picked || "";
  const dayEvents = eventsOnDay(events, day);
  const selected = dayEvents[0] ?? null;

  if (enabled === null) {
    return audience === "provider" ? null : <p className="text-sm text-muted">{fr ? "Ouverture du calendrier." : "Opening the calendar."}</p>;
  }
  if (!enabled) {
    if (audience === "provider") return null;
    return (
      <section data-ke="tour-calendar-off">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "Calendrier des visites" : "Tour calendar"}</h1>
        <p className="mt-3 text-base">
          {fr
            ? "KidEase montre les heures de visite qu’une garderie a publiées."
            : "KidEase shows the visit times a daycare has posted."}
        </p>
        <p className="mt-2 text-sm text-muted">{fr ? "Cette étape est éteinte. Aucun courriel n’est envoyé." : "This step is off. No email is sent."}</p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">{fr ? "Accueil" : "Go home"}</Link>
          </Button>
        </div>
      </section>
    );
  }

  const title = fr ? "Calendrier des visites" : "Tour calendar";
  const monthLabel = cursor.toLocaleDateString(fr ? "fr-CA" : "en-CA", { month: "long", year: "numeric" });

  async function remind() {
    if (!selected) return;
    const plan = tourReminderPlan(selected.startAt);
    if (!plan.ok) {
      toast.error(fr ? "C’est trop proche pour un rappel." : "That visit is too soon for a reminder.");
      return;
    }
    setBusy(true);
    try {
      const saved = await saveTourVisitReminder({
        data: { tourId: selected.tourId, centre: selected.title, startAt: selected.startAt },
      });
      if (!saved.ok) {
        toast.error(fr ? "Le rappel n’est pas ouvert." : "Reminders are not open.");
        return;
      }
      toast.success(fr ? "Rappel enregistré dans vos avis. Aucun courriel." : "Reminder saved in your notices. No email.");
    } catch {
      toast.error(fr ? "Ouvrez une session pour continuer." : "Sign in to continue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-ke="tour-calendar" className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{title}</h1>
        <p className="mt-3 text-base">
          {fr
            ? "Voici les visites encore ouvertes. Le rappel reste dans vos avis."
            : "These are the visits that are still open. The reminder stays in your notices."}
        </p>
        <p className="mt-2 text-sm text-muted">
          {fr ? "KidEase n’envoie pas de courriel, de texto ou d’appel." : "KidEase does not email, text, or call."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl capitalize">{monthLabel}</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => setCursor(new Date(year, month - 2, 1))}>
            {fr ? "Mois précédent" : "Previous month"}
          </Button>
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => setCursor(new Date(year, month, 1))}>
            {fr ? "Mois suivant" : "Next month"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {(fr ? WEEKDAYS_FR : WEEKDAYS_EN).map((label) => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const count = eventsOnDay(events, cell.day).length;
          const on = cell.day === picked;
          return (
            <button
              key={cell.day}
              type="button"
              className={`min-h-11 rounded-lg text-sm ${cell.inMonth ? "text-fg" : "text-subtle"} ${on ? "bg-primary text-primary-fg" : "bg-surface ring-1 ring-border"}`}
              onClick={() => setPicked(cell.day)}
            >
              {Number(cell.day.slice(-2))}
              {count ? <span className="mt-0.5 block text-[10px]">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {events.length === 0 ? (
        audience === "provider" ? (
          <p className="text-sm text-muted">{fr ? "Aucune visite ouverte." : "No open visit."}</p>
        ) : (
          <EmptyState
            title={fr ? "Aucune visite ouverte" : "No open visit"}
            body={fr ? "Une garderie doit publier une heure, ou vous en demandez une." : "A daycare posts a time, or you ask for one."}
            action={fr ? "Chercher une garderie" : "Search daycares"}
            actionTo="/search"
          />
        )
      ) : (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <h2 className="font-display text-xl">{picked ? picked : fr ? "Choisissez un jour" : "Pick a day"}</h2>
          {dayEvents.length === 0 ? <p className="mt-2 text-sm text-muted">{fr ? "Rien ce jour-là." : "Nothing on this day."}</p> : null}
          <ul className="mt-2 space-y-2">
            {dayEvents.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-muted">{event.startAt.slice(11, 16)}</p>
                <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary" onClick={() => downloadIcs(event)}>
                  {fr ? "Télécharger le fichier calendrier" : "Download the calendar file"}
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-4" variant={audience === "provider" ? "secondary" : "primary"} disabled={!selected || busy} onClick={() => void remind()}>
            {fr ? "Enregistrer un rappel" : "Save a reminder"}
          </Button>
        </div>
      )}
    </section>
  );
}
