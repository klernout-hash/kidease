import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Button } from "@/components/ui/button";
import { attendanceCopy, initialsFor, type AttendanceStatus } from "@/lib/attendance-handoff";
import { featureCopy } from "@/lib/flagged-feature-copy";
import { localePath } from "@/lib/locale-path";
import { centreClockLabel } from "@/lib/parent-arrival";
import {
  correctChildCheck,
  listDoorRoster,
  listMyChildAttendance,
  recordChildCheck,
} from "@/lib/server/child-checkin";
import type { Locale } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

function when(iso: string, locale: Locale, timeZone?: string | null) {
  return centreClockLabel(iso, locale === "fr" ? "fr" : "en", timeZone || "America/Winnipeg");
}

function statusWord(status: AttendanceStatus, copy: ReturnType<typeof attendanceCopy>) {
  if (status === "here") return copy.here;
  if (status === "picked_up") return copy.pickedUp;
  return copy.expected;
}

export function ChildCheckinDesk() {
  const { locale } = useCopy();
  const { celebrate } = useSuccessConfirm();
  const legacy = featureCopy(locale);
  const copy = attendanceCopy(locale);
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof listDoorRoster>> | null>(null);
  const [pickup, setPickup] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    return listDoorRoster()
      .then(setDesk)
      .catch(() => setDesk({ enabled: false, children: [], events: [], headcount: 0, canCorrect: false }));
  }

  useEffect(() => {
    void load();
  }, []);
  if (!desk?.enabled) return null;

  return (
    <section className="mt-8 w-full max-w-3xl" data-ke="child-checkin">
      <h2 className="font-display text-[clamp(1.6rem,4vw,2rem)]">{legacy.checkTitle}</h2>
      <p className="mt-2 max-w-prose text-base leading-7 text-muted">{copy.lead}</p>
      <p className="mt-3 text-lg font-semibold tabular-nums" data-ke="attendance-headcount">
        {copy.headcount.replace("{count}", String(desk.headcount))}
      </p>
      <p className="mt-1 text-sm text-muted">{copy.noPhoto}</p>
      <p className="mt-2 max-w-prose text-sm text-muted" data-ke="attendance-code-later">
        {copy.codeLater}
      </p>
      {desk.children.length ? (
        <ul className="mt-4 space-y-4">
          {desk.children.map((child) => (
            <li key={child.bookingId} className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="attendance-child">
              <div className="flex items-center gap-4">
                <span
                  className="grid size-20 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-semibold text-fg"
                  aria-hidden
                >
                  {initialsFor(child.childName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold leading-7">{child.childName}</p>
                  {child.demo ? <p className="text-sm text-muted">{copy.demo}</p> : null}
                  <p className="text-base leading-6 text-muted">{child.daycareName}</p>
                  <p className="mt-1 text-base font-medium" data-ke="attendance-status">
                    {statusWord(child.status, copy)}
                  </p>
                </div>
              </div>
              {child.next === "check_out" && child.pickups.length ? (
                <label className="mt-4 block text-sm">
                  {copy.pickup}
                  <select
                    className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
                    value={pickup[child.bookingId] || ""}
                    onChange={(event) => setPickup((cur) => ({ ...cur, [child.bookingId]: event.target.value }))}
                  >
                    <option value="">{copy.pickup}</option>
                    {child.pickups.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button
                type="button"
                className="mt-4 min-h-11 w-full touch-manipulation sm:w-auto"
                disabled={busy === child.bookingId}
                onClick={() => {
                  setBusy(child.bookingId);
                  void recordChildCheck({
                    data: {
                      bookingId: child.bookingId,
                      action: child.next,
                      pickupName: pickup[child.bookingId] || "",
                    },
                  })
                    .then((result) => {
                      if (!result.ok) {
                        setMessage("error" in result ? result.error : legacy.checkEmpty);
                        return;
                      }
                      setMessage(
                        result.duplicate
                          ? copy.already
                          : result.notice === "held"
                            ? `${copy.saved} ${copy.held}`
                            : result.notice === "waiting"
                              ? copy.queued
                              : copy.saved,
                      );
                      celebrate();
                      return load();
                    })
                    .catch(() => setMessage(legacy.checkEmpty))
                    .finally(() => setBusy(""));
                }}
              >
                {child.next === "check_in" ? copy.checkIn : copy.checkOut}
              </Button>
              {desk.canCorrect ? (
                <form
                  className="mt-3"
                  data-ke="attendance-correct"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const next = child.status === "here" ? "check_out" : "check_in";
                    setBusy(child.bookingId);
                    void correctChildCheck({
                      data: { bookingId: child.bookingId, action: next, reason: reason[child.bookingId] || "" },
                    })
                      .then((result) => {
                        setMessage(result.ok ? copy.saved : "error" in result ? result.error : legacy.checkEmpty);
                        if (result.ok) return load();
                      })
                      .catch(() => setMessage(legacy.checkEmpty))
                      .finally(() => setBusy(""));
                  }}
                >
                  <label className="block text-sm">
                    {copy.reason}
                    <input
                      value={reason[child.bookingId] || ""}
                      onChange={(event) => setReason((cur) => ({ ...cur, [child.bookingId]: event.target.value }))}
                      className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
                    />
                  </label>
                  <Button type="submit" variant="outline" className="mt-2 min-h-11 touch-manipulation">
                    {copy.correct}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{legacy.checkEmpty}</p>
      )}
      {message ? (
        <p className="mt-3 text-sm" role="status" data-ke="attendance-notice">
          {message}
        </p>
      ) : null}
      <Link to={localePath("/help", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {legacy.help}
      </Link>
    </section>
  );
}

export function AttendanceSamples({ locale }: { locale: "en" | "fr" }) {
  const copy = attendanceCopy(locale);
  const samples = [
    { name: "DEMO Avery", centre: "DEMO QA Centre", status: "here" as const },
    { name: "DEMO Blair", centre: "DEMO QA Centre", status: "expected" as const },
    { name: "DEMO Casey", centre: "DEMO QA Centre", status: "picked_up" as const },
  ];
  return (
    <div data-ke="attendance-samples">
      <p className="text-sm font-medium text-muted">{copy.demo}</p>
      <section className="mt-4" data-ke="attendance-sample-staff">
        <h2 className="font-display text-[clamp(1.6rem,4vw,2rem)]">{copy.title}</h2>
        <p className="mt-2 max-w-prose text-base leading-7 text-muted">{copy.lead}</p>
        <p className="mt-3 text-lg font-semibold tabular-nums" data-ke="attendance-headcount">
          {copy.headcount.replace("{count}", "1")}
        </p>
        <p className="mt-1 text-sm text-muted">{copy.noPhoto}</p>
        <p className="mt-2 max-w-prose text-sm text-muted" data-ke="attendance-code-later">{copy.codeLater}</p>
        <ul className="mt-4 space-y-4">
          {samples.map((child) => (
            <li key={child.name} className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="attendance-child">
              <div className="flex items-center gap-4">
                <span className="grid size-20 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-semibold" aria-hidden>
                  {initialsFor(child.name)}
                </span>
                <div>
                  <p className="text-xl font-semibold leading-7">{child.name}</p>
                  <p className="text-base text-muted">{child.centre}</p>
                  <p className="mt-1 text-base font-medium">{statusWord(child.status, copy)}</p>
                </div>
              </div>
              <button type="button" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-fg" disabled>
                {child.status === "here" ? copy.checkOut : copy.checkIn}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm" data-ke="attendance-notice">{copy.held}</p>
      </section>
      <section className="mt-8" data-ke="attendance-sample-parent">
        <h2 className="font-display text-2xl">{copy.parentTitle}</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">{copy.parentLead}</p>
        <ul className="mt-4 space-y-4">
          {samples.map((child) => (
            <li key={child.name} className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="parent-attendance-child">
              <div className="flex items-center gap-4">
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl font-semibold" aria-hidden>
                  {initialsFor(child.name)}
                </span>
                <div>
                  <p className="text-lg font-semibold">{child.name}</p>
                  <p className="text-sm text-muted">{child.centre}</p>
                  <p className="mt-1 text-base font-medium">{statusWord(child.status, copy)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ChildCheckHistory() {
  const { locale } = useCopy();
  const legacy = featureCopy(locale);
  const copy = attendanceCopy(locale);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyChildAttendance>> | null>(null);
  useEffect(() => {
    void listMyChildAttendance()
      .then(setRows)
      .catch(() => setRows({ enabled: false, children: [] }));
  }, []);
  if (!rows?.enabled) return null;
  return (
    <section className="mt-8 w-full" data-ke="child-check-history">
      <h2 className="font-display text-2xl">{copy.parentTitle}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">{copy.parentLead}</p>
      <p className="mt-1 text-sm text-muted">{copy.noPhoto}</p>
      {rows.children.length ? (
        <ul className="mt-4 space-y-4">
          {rows.children.map((child) => (
            <li key={child.bookingId} className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="parent-attendance-child">
              <div className="flex items-center gap-4">
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl font-semibold" aria-hidden>
                  {initialsFor(child.childName)}
                </span>
                <div>
                  <p className="text-lg font-semibold">{child.childName}</p>
                  {child.demo ? <p className="text-sm text-muted">{copy.demo}</p> : null}
                  <p className="text-sm text-muted">{child.daycareName}</p>
                  <p className="mt-1 text-base font-medium">{statusWord(child.status, copy)}</p>
                </div>
              </div>
              {child.events.length ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {child.events.map((event) => (
                    <li key={event.id} className="py-2">
                      {event.correction ? `${copy.correct}: ` : ""}
                      {event.action === "check_in" ? legacy.arrived : legacy.left} · {when(event.at, locale, event.timeZone || child.timeZone)}
                      {event.pickupName ? ` · ${event.pickupName}` : ""}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">{legacy.checkNone}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{legacy.checkNone}</p>
      )}
    </section>
  );
}
