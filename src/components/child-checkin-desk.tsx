import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { featureCopy } from "@/lib/flagged-feature-copy";
import { localePath } from "@/lib/locale-path";
import { localeTag } from "@/lib/languages";
import { listDoorRoster, listMyCheckHistory, recordChildCheck } from "@/lib/server/child-checkin";
import type { Locale } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

function when(iso: string, locale: Locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(localeTag(locale), { dateStyle: "medium", timeStyle: "short" });
}

export function ChildCheckinDesk() {
  const { locale } = useCopy();
  const copy = featureCopy(locale);
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof listDoorRoster>> | null>(null);
  const [pickup, setPickup] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  function load() {
    return listDoorRoster()
      .then(setDesk)
      .catch(() => setDesk({ enabled: false, children: [], events: [] }));
  }

  useEffect(() => {
    void load();
  }, []);
  if (!desk?.enabled) return null;

  return (
    <section className="mt-8 w-full max-w-3xl" data-ke="child-checkin">
      <h2 className="font-display text-2xl">{copy.checkTitle}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{copy.checkLead}</p>
      {desk.children.length ? (
        <ul className="mt-4 space-y-3">
          {desk.children.map((child) => (
            <li key={child.bookingId} className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <p className="font-medium">{child.childName}</p>
              <p className="text-sm text-muted">{child.daycareName}</p>
              {child.next === "check_out" && child.pickups.length ? (
                <label className="mt-2 block text-sm">
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
                className="mt-3"
                onClick={() => {
                  void recordChildCheck({
                    data: {
                      bookingId: child.bookingId,
                      action: child.next,
                      pickupName: pickup[child.bookingId] || "",
                    },
                  })
                    .then((result) => {
                      setMessage(result.ok ? copy.checkSaved : copy.checkEmpty);
                      return load();
                    })
                    .catch(() => setMessage(copy.checkEmpty));
                }}
              >
                {child.next === "check_in" ? copy.checkIn : copy.checkOut}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{copy.checkEmpty}</p>
      )}
      {desk.events.length ? (
        <ul className="mt-4 divide-y divide-border text-sm">
          {desk.events.map((event) => (
            <li key={event.id} className="py-2">
              {event.childName} · {event.action === "check_in" ? copy.arrived : copy.left} · {when(event.at, locale)}
              {event.pickupName ? ` · ${event.pickupName}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Link to={localePath("/help", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {copy.help}
      </Link>
    </section>
  );
}

export function ChildCheckHistory() {
  const { locale } = useCopy();
  const copy = featureCopy(locale);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyCheckHistory>> | null>(null);
  useEffect(() => {
    void listMyCheckHistory()
      .then(setRows)
      .catch(() => setRows({ enabled: false, events: [] }));
  }, []);
  if (!rows?.enabled) return null;
  return (
    <section className="mt-8 w-full" data-ke="child-check-history">
      <h2 className="font-display text-2xl">{copy.checkHistory}</h2>
      <p className="mt-2 text-sm text-muted">{copy.checkHistoryLead}</p>
      {rows.events.length ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {rows.events.map((event) => (
            <li key={event.id} className="py-2">
              {event.childName} · {event.daycareName} · {event.action === "check_in" ? copy.arrived : copy.left} · {when(event.at, locale)}
              {event.pickupName ? ` · ${event.pickupName}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{copy.checkNone}</p>
      )}
    </section>
  );
}
