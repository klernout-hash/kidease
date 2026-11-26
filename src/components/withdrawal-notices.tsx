import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  cancelWithdrawal,
  listCentreWithdrawals,
  listMyWithdrawalOptions,
  requestWithdrawal,
} from "@/lib/server/wiring/withdrawal";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { useCopy } from "@/lib/use-copy";

type Options = Awaited<ReturnType<typeof listMyWithdrawalOptions>>;
type CentreRows = Awaited<ReturnType<typeof listCentreWithdrawals>>["rows"];

function dayLabel(day: string, locale: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

function errorText(code: string, locale: string): string {
  const fr = locale === "fr";
  if (code === "not_enrolled")
    return fr
      ? "Votre enfant n’est pas inscrit à ce centre."
      : "Your child is not enrolled at this centre.";
  if (code === "notice")
    return fr
      ? "Ce jour ne respecte pas le préavis du centre."
      : "That day is earlier than the centre’s notice period.";
  if (code === "terms")
    return fr
      ? "Le centre n’a pas encore indiqué son préavis."
      : "The centre has not set its notice period yet.";
  if (code === "past") return fr ? "Le dernier jour est passé." : "The last day has passed.";
  return pipelineCopy(locale).error;
}

/** Parent: give notice (last day + optional reason), see it, and cancel it. */
export function ParentWithdrawalForm() {
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const [options, setOptions] = useState<Options | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  function load() {
    return listMyWithdrawalOptions()
      .then((result) => {
        setOptions(result);
        setDaycareId((cur) => cur || result.centres[0]?.daycareId || "");
      })
      .catch(() => setOptions({ enabled: true, centres: [], notices: [] }));
  }

  useEffect(() => {
    void load();
  }, []);

  if (!options) return <p className="text-sm text-muted">{pc.agreementLoading}</p>;
  const centre = options.centres.find((row) => row.daycareId === daycareId);

  return (
    <div className="space-y-6" data-ke="parent-withdrawal">
      {options.centres.length === 0 ? (
        <p className="text-sm text-muted">{pc.withdrawalNoCentre}</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setNote("");
            void requestWithdrawal({
              data: { daycareId, ageGroup: centre?.ageGroup || "preschool", lastDay, reason },
            })
              .then((row) => {
                if (!row.ok) {
                  setNote(errorText(row.error, locale));
                  return;
                }
                toast.success(pc.withdrawalSent);
                setReason("");
                return load();
              })
              .catch(() => setNote(pc.error))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm font-medium" htmlFor="wd-centre">
            {pc.withdrawalCentre}
            <select
              id="wd-centre"
              value={daycareId}
              onChange={(event) => setDaycareId(event.target.value)}
              className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3"
            >
              {options.centres.map((row) => (
                <option key={row.daycareId} value={row.daycareId}>
                  {row.childName ? `${row.daycareName} · ${row.childName}` : row.daycareName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor="wd-last">
            {pc.withdrawalLastDay}
            <input
              id="wd-last"
              type="date"
              required
              value={lastDay}
              onChange={(event) => setLastDay(event.target.value)}
              className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <label className="block text-sm font-medium" htmlFor="wd-reason">
            {pc.withdrawalReason}
            <textarea
              id="wd-reason"
              value={reason}
              maxLength={280}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={busy || !daycareId || !lastDay}>
            {pc.withdrawalSend}
          </Button>
          {note ? (
            <p className="text-sm" role="status">
              {note}
            </p>
          ) : null}
        </form>
      )}
      {options.notices.length ? (
        <section>
          <h2 className="font-display text-xl">{pc.withdrawalMine}</h2>
          <ul className="mt-2 divide-y divide-border">
            {options.notices.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.daycareName}</p>
                  <p className="text-sm text-muted">
                    {pc.withdrawalOwnerRow.replace("{day}", dayLabel(row.lastDay, locale))}
                  </p>
                  {row.reason ? <p className="text-sm text-muted">{row.reason}</p> : null}
                </div>
                {row.cancelable ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void cancelWithdrawal({ data: { id: row.id } })
                        .then((result) => {
                          if (!result.ok) {
                            toast.error(errorText(result.error, locale));
                            return;
                          }
                          toast.success(pc.withdrawalCancelled);
                          return load();
                        })
                        .catch(() => toast.error(pc.error))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {pc.withdrawalCancel}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Owner: every notice a family gave, soonest last day first. Hidden when there are none. */
export function CentreWithdrawalNotices({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const [rows, setRows] = useState<CentreRows | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let live = true;
    void listCentreWithdrawals()
      .then((result) => {
        if (!live) return;
        setEnabled(result.enabled);
        setRows(result.rows);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!enabled || !rows) return null;
  if (!rows.length && hideWhenEmpty) return null;
  return (
    <section className="space-y-2" data-ke="centre-withdrawals">
      <h2 className="font-display text-2xl">{pc.withdrawalOwnerTitle}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{pc.withdrawalOwnerEmpty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-surface px-4 ring-1 ring-border">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <p className="font-medium">
                {row.parentName} · {row.daycareName}
              </p>
              <p className="text-sm text-muted">
                {pc.withdrawalOwnerRow.replace("{day}", dayLabel(row.lastDay, locale))}
              </p>
              {row.reason ? (
                <p className="text-sm">
                  {pc.withdrawalReasonLabel}: {row.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
