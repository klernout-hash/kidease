import { Link } from "@tanstack/react-router";
import { finishListingCopy, requestsWaiting, todayKey, toursBookedOn, type TodayLead, type TodayTour } from "@/lib/host-style-today";
import { listingCompleteness } from "@/lib/listing-readiness";
import type { Daycare } from "@/lib/types";

/** Arrivals, today's tours, and requests waiting. One primary step: open requests when any are waiting. */
export function HostStyleToday({
  locale,
  leads,
  tours,
  listings,
  owner,
  now,
}: {
  locale: "en" | "fr";
  leads: readonly TodayLead[];
  tours: readonly TodayTour[];
  listings: readonly Daycare[];
  owner: boolean;
  now?: Date;
}) {
  const fr = locale === "fr";
  const day = todayKey(now);
  const booked = toursBookedOn(tours, day);
  const waiting = requestsWaiting(leads, tours);
  const missing = listings[0] ? listingCompleteness(listings[0]).missing.length : 0;
  const finish = owner ? finishListingCopy(locale, missing) : null;
  return (
    <section className="space-y-3" data-ke="host-style-today">
      <div>
        <h2 className="font-display text-2xl">{fr ? "Aujourd'hui" : "Today"}</h2>
        <p className="mt-1 text-sm text-muted">
          {fr
            ? "Les arrivées, les visites d'aujourd'hui et les demandes en attente."
            : "Arrivals, tours booked today, and requests that are waiting."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="today-arrivals">
          <h3 className="font-medium">{fr ? "Arrivées" : "Arrivals"}</h3>
          <p className="mt-1 text-sm text-muted">
            {fr ? "Les présences sont juste en dessous." : "Check-in is just below."}
          </p>
        </article>
        <article className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="today-tours">
          <h3 className="font-medium">{fr ? "Visites aujourd'hui" : "Tours today"}</h3>
          {booked.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{fr ? "Aucune visite réservée aujourd'hui." : "No tours booked today."}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {booked.slice(0, 3).map((tour) => (
                <li key={tour.id}>{tour.childName || tour.parentName || (fr ? "Visite" : "Tour")}</li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="today-requests">
          <h3 className="font-medium">{fr ? "Demandes en attente" : "Requests waiting"}</h3>
          <p className="mt-1 text-sm tabular-nums">
            {waiting === 0
              ? fr
                ? "Rien n'attend."
                : "Nothing is waiting."
              : fr
                ? `${waiting} en attente`
                : `${waiting} waiting`}
          </p>
          {waiting > 0 ? (
            <Link
              to="/provider"
              search={{ desk: "requests" }}
              className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
            >
              {fr ? "Ouvrir les demandes" : "Open requests"}
            </Link>
          ) : null}
        </article>
      </div>
      {finish ? (
        <details className="rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-border" data-ke="finish-listing">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">{finish.title}</summary>
          <p className="mt-2 text-muted">{finish.body}</p>
          <Link to="/provider" search={{ desk: "listings" }} className="mt-2 inline-flex min-h-11 items-center font-medium text-primary">
            {fr ? "Ouvrir la fiche" : "Open the listing"}
          </Link>
        </details>
      ) : null}
    </section>
  );
}
