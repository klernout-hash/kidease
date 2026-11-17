import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { attendanceCopy } from "@/lib/attendance-handoff";
import { isEnrolledBookingStatus } from "@/lib/daily-care";
import { parentDeskPath } from "@/lib/desk-nav";
import { centreClockLabel } from "@/lib/parent-arrival";
import { parentHomeCareRows, type ParentHomeCareSnapshot } from "@/lib/parent-home-care";
import { listMyChildAttendance } from "@/lib/server/child-checkin";
import { listDailyJournals } from "@/lib/server/daily-care";
import { loadDeskFeatureFlags } from "@/lib/server/desk-features";
import { LOADER_SETTLE_MS, withTimeout } from "@/lib/timeout";
import type { Booking } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

type CareState =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; snapshot: ParentHomeCareSnapshot };

/** Read-only home snapshot. Existing server functions keep their own access and feature gates. */
export function ParentHomeCare({ bookings, userId }: { bookings: Booking[]; userId: string }) {
  const enrolled = useMemo(
    () => bookings.filter((booking) => isEnrolledBookingStatus(booking.status)),
    [bookings],
  );
  const identity = `${userId}:${enrolled.map((booking) => `${booking.id}:${booking.daycareId}`).join("|")}`;
  const [result, setResult] = useState<{ identity: string; state: CareState }>({
    identity,
    state: { kind: "loading" },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setResult({ identity, state: { kind: "loading" } });
    const load = async (): Promise<ParentHomeCareSnapshot> => {
      const [attendance, flags] = await Promise.all([
        listMyChildAttendance(),
        loadDeskFeatureFlags(),
      ]);
      const ids = new Set(enrolled.map((booking) => booking.id));
      const children = attendance.children.filter((child) => ids.has(child.bookingId));
      const notes = flags.dailyLogs
        ? await Promise.all(
            children.map((child) => {
              const booking = enrolled.find((item) => item.id === child.bookingId)!;
              return listDailyJournals({
                data: { bookingId: booking.id, daycareId: booking.daycareId, day: child.localDay },
              });
            }),
          )
        : [];
      return {
        attendanceEnabled: attendance.enabled,
        journalsEnabled: flags.dailyLogs,
        attendance: children,
        journals: notes.flatMap((note) => note.items),
      };
    };
    void withTimeout(load(), LOADER_SETTLE_MS, "Care snapshot timed out")
      .then((snapshot) => {
        if (live) setResult({ identity, state: { kind: "ready", snapshot } });
      })
      .catch(() => {
        if (live) setResult({ identity, state: { kind: "error" } });
      });
    return () => {
      live = false;
    };
  }, [identity, enrolled, attempt]);

  const state: CareState = result.identity === identity ? result.state : { kind: "loading" };
  return (
    <ParentHomeCareContent
      bookings={enrolled}
      state={state}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

/** Kept separate so synthetic previews can render the actual home content. */
export function ParentHomeCareContent({
  bookings,
  state,
  onRetry,
}: {
  bookings: Booking[];
  state: CareState;
  onRetry: () => void;
}) {
  const { locale, t } = useCopy();
  const fr = locale === "fr";
  const copy = attendanceCopy(locale);
  const parentPath = parentDeskPath(
    useRouterState({ select: (router) => router.location.pathname }),
  );
  const rows =
    state.kind === "ready"
      ? parentHomeCareRows(bookings, state.snapshot)
      : bookings
          .filter((booking) => isEnrolledBookingStatus(booking.status))
          .map((booking) => ({ booking, attendance: undefined, journal: undefined }));
  return (
    <section
      className="ph-no-capture mt-4 space-y-3"
      data-ke="parent-home-care"
      aria-busy={state.kind === "loading"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">
          {fr ? "La journée de votre enfant" : "Your child's day"}
        </h2>
        <Link
          to={parentPath}
          search={{ tab: "care" }}
          className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {fr ? "Ouvrir les soins du jour" : "Open daily care"}
        </Link>
      </div>
      {state.kind === "error" ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted" role="alert">
            {fr
              ? "Les nouvelles du jour ne sont pas disponibles. Réessayez ou ouvrez les soins du jour."
              : "Today's care updates couldn't be loaded. Try again or open daily care."}
          </p>
          <Button type="button" variant="secondary" className="mt-3" onClick={onRetry}>
            {fr ? "Réessayer" : "Try again"}
          </Button>
        </div>
      ) : null}
      <ul className="space-y-3">
        {rows.map(({ booking, attendance, journal }) => (
          <li
            key={booking.id}
            className="min-w-0 space-y-2 break-words rounded-xl border border-border bg-surface p-4"
            data-ke="parent-home-care-child"
          >
            <div>
              <h3 className="font-medium">
                {booking.childName || attendance?.childName || (fr ? "Votre enfant" : "Your child")}
              </h3>
              <p className="text-sm text-muted">{booking.daycareName}</p>
            </div>
            <div className="min-h-[12rem] space-y-2">
              {state.kind === "loading" ? (
                <p className="text-sm text-muted" role="status">
                  {fr ? "Recherche des nouvelles du jour…" : "Checking today's care updates…"}
                </p>
              ) : state.kind === "error" ? (
                <p className="text-sm text-muted">
                  {fr
                    ? "Ouvrez les soins du jour pour voir les détails disponibles."
                    : "Open daily care to see available details."}
                </p>
              ) : attendance ? (
                <>
                  <p className="text-xs text-muted">
                    <time dateTime={attendance.localDay}>{attendance.localDay}</time> ·{" "}
                    {attendance.timeZone}
                  </p>
                  <p className="text-sm" data-ke="parent-home-care-status">
                    {!state.snapshot.attendanceEnabled
                      ? fr
                        ? "Les arrivées et départs confirmés ne sont pas activés."
                        : "Confirmed arrivals and pickups are not turned on."
                      : !attendance.events.length
                        ? t("careNoArrivalConfirmed")
                        : attendance.status === "here"
                          ? copy.here
                          : attendance.status === "picked_up"
                            ? copy.pickedUp
                            : t("careNoArrivalConfirmed")}
                  </p>
                  {state.snapshot.attendanceEnabled && attendance.lastUpdated ? (
                    <p className="text-xs text-muted">
                      {t("careAttendanceUpdated")
                        .replace("{name}", attendance.lastUpdated.name || t("careCentreStaff"))
                        .replace(
                          "{time}",
                          centreClockLabel(
                            attendance.lastUpdated.at,
                            fr ? "fr" : "en",
                            attendance.timeZone,
                          ),
                        )}
                    </p>
                  ) : null}
                  <div>
                    <h4 className="text-sm font-medium">
                      {fr ? "Dernière note du jour · aperçu" : "Latest note today · preview"}
                    </h4>
                    <p
                      className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted"
                      data-ke="parent-home-care-note"
                    >
                      {!state.snapshot.journalsEnabled
                        ? fr
                          ? "Le journal du jour n'est pas activé."
                          : "Daily notes are not turned on."
                        : journal?.body ||
                          (fr
                            ? "Aucune note du jour n'est disponible ici."
                            : "No saved note for this day is available here.")}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {fr
                    ? "Les détails du jour ne sont pas disponibles sur ce compte. Ouvrez les soins du jour ou demandez au centre."
                    : "Today's care details are not available on this account. Open daily care or ask the centre."}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
