import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { eventZoneLabel, forecastVisible, miniSitePath, staffSeesAbsence } from "@/lib/phase5-rules";
import { phase5Flags } from "@/lib/server/phase5";

type Flags = Awaited<ReturnType<typeof phase5Flags>>;
const EMPTY: Flags = { absence: false, events: false, immunization: false, miniSite: false, forecast: false };

/**
 * Hidden until a Phase 5 flag is on. Nothing on this desk sends or charges.
 * `actionsOnly` keeps just the card with a working link (the centre page), so a
 * daily work screen is not buried under cards that only describe a feature.
 */
export function Phase5Desk({
  locale,
  role,
  slug,
  actionsOnly = false,
}: {
  locale: "en" | "fr";
  role: string | null;
  slug?: string;
  actionsOnly?: boolean;
}) {
  const [flags, setFlags] = useState<Flags>(EMPTY);
  const fr = locale === "fr";
  useEffect(() => {
    let live = true;
    void phase5Flags()
      .then((next) => {
        if (live) setFlags(next);
      })
      .catch(() => {
        if (live) setFlags(EMPTY);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!Object.values(flags).some(Boolean)) return null;
  if (actionsOnly) {
    if (!flags.miniSite || role === "parent" || !slug) return null;
    return (
      <p className="mt-4 text-sm" data-ke="centre-minisite">
        <Link to="/c/$slug" params={{ slug }} className="inline-flex min-h-11 items-center font-medium text-primary">
          {fr ? "Voir la page du centre" : "View your centre page"}
        </Link>
      </p>
    );
  }
  const sample = eventZoneLabel("2026-11-09T15:00:00.000Z", "America/Winnipeg");
  return (
    <div className="mt-6 space-y-4" data-ke="phase5-desk">
      {flags.absence && (role === "parent" || staffSeesAbsence(role)) ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="parent-absence">
          <h2 className="font-display text-xl">{fr ? "Absence" : "Absence"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "Un parent marque l'enfant absent. La place n'est pas offerte à nouveau. Rien n'est envoyé."
              : "A parent marks the child absent. The spot is not offered again. Nothing is sent."}
          </p>
        </section>
      ) : null}
      {flags.events ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="event-rsvp">
          <h2 className="font-display text-xl">{fr ? "Événements" : "Events"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr ? `L'heure suit le centre. Exemple: ${sample}. Pas de courriel.` : `The time follows the centre. Example: ${sample}. No email.`}
          </p>
        </section>
      ) : null}
      {flags.immunization && role !== "billing" ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="immunization-file">
          <h2 className="font-display text-xl">{fr ? "Vaccins au dossier" : "Immunization on file"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "Au dossier, manquant, ou date dépassée. Aucun score. Aucun avis général."
              : "On file, missing, or a date that has passed. No score. No broadcast."}
          </p>
        </section>
      ) : null}
      {flags.miniSite && role !== "parent" && slug ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="centre-minisite">
          <h2 className="font-display text-xl">{fr ? "Page du centre" : "Centre page"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr ? "KidEase n'approuve pas ce centre. Seul un centre réclamé a cette page." : "KidEase does not endorse this centre. Only a claimed centre has this page."}
          </p>
          <Link to="/c/$slug" params={{ slug }} className="mt-3 inline-flex min-h-11 items-center font-medium text-primary">
            {miniSitePath(slug)}
          </Link>
        </section>
      ) : null}
      {flags.forecast && forecastVisible(role) ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="room-forecast">
          <h2 className="font-display text-xl">{fr ? "Ouvertures de salles" : "Room openings"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr ? "Une estimation pour le centre seulement. Ce n'est pas une place publique." : "An estimate for the centre only. It is not a public opening."}
          </p>
          <Button type="button" className="mt-3" disabled>
            {fr ? "Estimation" : "Estimate"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
