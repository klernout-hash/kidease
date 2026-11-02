import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { timesheetCopy } from "@/lib/timesheet-copy";
import { formatToronto, isoToTorontoLocal, torontoLocalToIso } from "@/lib/timesheet";
import {
  clockInTimesheet,
  clockOutTimesheet,
  editTimesheet,
  exportTimesheetCsv,
  listTimesheets,
  timesheetStatus,
} from "@/lib/server/timesheets";
import { useCopy } from "@/lib/use-copy";

type Desk = Awaited<ReturnType<typeof listTimesheets>>;
type Entry = Desk extends { week: infer W } ? W extends Array<infer E> ? E : never : never;

function explain(err: unknown, errors: Record<string, string>, fallback: string) {
  const message = err instanceof Error ? err.message : "";
  const code = message.startsWith("timesheet:") ? message.slice("timesheet:".length) : "";
  return errors[code] || fallback;
}

function focusIn(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

export function TimesheetDeskLink() {
  const { locale } = useCopy();
  const copy = timesheetCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void timesheetStatus()
      .then((row) => setOn(row.enabled))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mt-3">
      <Link
        to="/provider"
        search={{ desk: "hours" }}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
      >
        {copy.title}
      </Link>
    </p>
  );
}

export function StaffTimesheetDesk() {
  const { locale } = useCopy();
  const copy = timesheetCopy(locale);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ staffName: "", clockIn: "", clockOut: "", note: "" });

  function load(id = daycareId) {
    void listTimesheets({ data: { daycareId: id } })
      .then((row) => {
        setDesk(row);
        if (row.enabled && row.daycareId) setDaycareId(row.daycareId);
      })
      .catch(() =>
        setDesk({ enabled: false, centres: [], daycareId: "", weekLabel: "", open: [], week: [], totals: [], edits: [] }),
      );
  }

  useEffect(() => {
    load();
    // First paint only. Centre changes call load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) {
    return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/provider" />;
  }

  const activeId = daycareId || desk.daycareId;

  function startEdit(entry: Entry) {
    setEditing(entry.id);
    setEdit({
      staffName: entry.staffName,
      clockIn: isoToTorontoLocal(entry.clockIn),
      clockOut: entry.clockOut ? isoToTorontoLocal(entry.clockOut) : "",
      note: "",
    });
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        <p className="mt-2 text-sm">{copy.countsOn}</p>
        <p className="mt-1 text-sm text-muted">{copy.noPay}</p>
        {desk.weekLabel ? (
          <p className="mt-2 text-sm font-medium">
            {copy.week} {desk.weekLabel}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {desk.centres.length > 1 ? (
        <label className="block text-sm">
          {copy.centre}
          <select
            className="ke-input mt-1 min-h-11 w-full"
            value={activeId}
            onChange={(event) => {
              setDaycareId(event.target.value);
              load(event.target.value);
            }}
          >
            {desk.centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form
        className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void clockInTimesheet({ data: { daycareId: activeId, staffName: name } })
            .then(() => {
              toast.success(copy.saved);
              setName("");
              load(activeId);
            })
            .catch((err) => setError(explain(err, copy.errors, copy.bad)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm">
          {copy.name}
          <input
            className="ke-input mt-1 min-h-11 w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={focusIn}
            required
            autoComplete="name"
          />
        </label>
        <Button type="submit" disabled={busy || !activeId}>
          {copy.clockIn}
        </Button>
      </form>

      <div>
        <h3 className="font-display text-xl">{copy.stillIn}</h3>
        {desk.open.length === 0 ? <p className="mt-2 text-sm text-muted">{copy.noRows}</p> : null}
        <ul className="mt-3 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {desk.open.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <span className="font-medium">{entry.staffName}</span>
                <span className="mt-1 block text-sm text-muted">{formatToronto(entry.clockIn)}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void clockOutTimesheet({ data: { daycareId: activeId, entryId: entry.id } })
                    .then(() => {
                      toast.success(copy.saved);
                      load(activeId);
                    })
                    .catch((err) => setError(explain(err, copy.errors, copy.bad)))
                    .finally(() => setBusy(false));
                }}
              >
                {copy.clockOut}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-xl">{copy.thisWeek}</h3>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !activeId}
            onClick={() => {
              setBusy(true);
              setError("");
              void exportTimesheetCsv({ data: { daycareId: activeId, locale } })
                .then((file) => {
                  const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = file.filename;
                  link.click();
                  URL.revokeObjectURL(url);
                })
                .catch((err) => setError(explain(err, copy.errors, copy.bad)))
                .finally(() => setBusy(false));
            }}
          >
            {copy.exportCsv}
          </Button>
        </div>
        {desk.totals.length === 0 ? <p className="mt-2 text-sm text-muted">{copy.noRows}</p> : null}
        <ul className="mt-3 space-y-2">
          {desk.totals.map((row) => (
            <li key={row.staffName} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
              <span className="font-medium">{row.staffName}</span>
              <span className="tabular-nums">
                {row.hours.toFixed(1)} {copy.hours}
                {row.open ? ` · ${copy.openShift}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {desk.week.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p className="font-medium">{entry.staffName}</p>
              <p className="text-sm text-muted">
                {formatToronto(entry.clockIn)}
                {entry.clockOut ? ` – ${formatToronto(entry.clockOut)}` : ` · ${copy.openShift}`}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary touch-manipulation"
                onClick={() => startEdit(entry)}
              >
                {copy.edit}
              </button>
              {editing === entry.id ? (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const clockIn = torontoLocalToIso(edit.clockIn);
                    const clockOut = edit.clockOut ? torontoLocalToIso(edit.clockOut) : "";
                    if (!clockIn || (edit.clockOut && !clockOut)) {
                      setError(copy.errors.time);
                      return;
                    }
                    setBusy(true);
                    setError("");
                    void editTimesheet({
                      data: {
                        daycareId: activeId,
                        entryId: entry.id,
                        staffName: edit.staffName,
                        clockIn,
                        clockOut: clockOut || "",
                        note: edit.note,
                      },
                    })
                      .then(() => {
                        toast.success(copy.saved);
                        setEditing(null);
                        load(activeId);
                      })
                      .catch((err) => setError(explain(err, copy.errors, copy.bad)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <label className="block text-sm">
                    {copy.name}
                    <input
                      className="ke-input mt-1 min-h-11 w-full"
                      value={edit.staffName}
                      onChange={(event) => setEdit({ ...edit, staffName: event.target.value })}
                      onFocus={focusIn}
                    />
                  </label>
                  <label className="block text-sm">
                    {copy.clockIn}
                    <input
                      className="ke-input mt-1 min-h-11 w-full"
                      type="datetime-local"
                      value={edit.clockIn}
                      onChange={(event) => setEdit({ ...edit, clockIn: event.target.value })}
                      onFocus={focusIn}
                    />
                  </label>
                  <label className="block text-sm">
                    {copy.clockOut}
                    <input
                      className="ke-input mt-1 min-h-11 w-full"
                      type="datetime-local"
                      value={edit.clockOut}
                      onChange={(event) => setEdit({ ...edit, clockOut: event.target.value })}
                      onFocus={focusIn}
                    />
                  </label>
                  <label className="block text-sm">
                    {copy.note}
                    <input
                      className="ke-input mt-1 min-h-11 w-full"
                      value={edit.note}
                      onChange={(event) => setEdit({ ...edit, note: event.target.value })}
                      onFocus={focusIn}
                      required
                    />
                  </label>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {copy.saveEdit}
                  </Button>
                </form>
              ) : null}
              {desk.edits.some((row) => row.entryId === entry.id) ? (
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  <li className="font-medium text-fg">{copy.audit}</li>
                  {desk.edits
                    .filter((row) => row.entryId === entry.id)
                    .map((row) => (
                      <li key={row.id}>
                        {(row.actorName || copy.name) + ": "}
                        {row.field} · {row.note || formatToronto(row.at)}
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
