import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/success-confirm";
import {
  alertSettingRows,
  alertSettingsIntro,
  stillLookingCopy,
  type AlertAudience,
  type AlertLocale,
} from "@/lib/alert-push";
import { confirmStillLooking, getMyAlertPrefs, saveMyAlertPrefs } from "@/lib/server/alert-push-api";
import { useCopy } from "@/lib/use-copy";

export function AlertPushSettings({
  audience,
  subscriptionsOn,
}: {
  audience: AlertAudience;
  subscriptionsOn: boolean;
}) {
  const { t, locale } = useCopy();
  const loc: AlertLocale = locale === "fr" ? "fr" : "en";
  const intro = alertSettingsIntro(loc, audience);
  const rows = alertSettingRows(audience, loc, subscriptionsOn);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.category, true])),
  );
  const [saving, setSaving] = useState(false);
  const [loadNote, setLoadNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getMyAlertPrefs()
      .then((next) => {
        if (!cancelled) setPrefs(next);
      })
      .catch(() => {
        if (!cancelled) setLoadNote(intro.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [intro.loadError]);

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="alert-settings">
      <h2 className="font-display text-2xl tracking-[-0.03em]">{intro.title}</h2>
      <p className="mt-2 text-sm text-muted">{intro.lead}</p>
      <p className="mt-2 text-sm text-muted">{intro.founding}</p>
      <p className="mt-2 text-sm text-fg">{intro.quiet}</p>
      {loadNote ? (
        <p className="mt-3 text-sm text-muted" role="alert">
          {loadNote}
        </p>
      ) : null}
      <form
        className="mt-4 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          void saveMyAlertPrefs({
            data: {
              items: rows.map((row) => ({
                category: row.category,
                enabled: prefs[row.category] !== false,
              })),
            },
          })
            .then((next) => {
              setPrefs(next);
              confirmAction(t, "alertsSaved");
            })
            .catch(() => toast.error(intro.error))
            .finally(() => setSaving(false));
        }}
      >
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.category}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0 accent-primary"
                  checked={prefs[row.category] !== false}
                  onChange={(event) =>
                    setPrefs((cur) => ({ ...cur, [row.category]: event.target.checked }))
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{row.label}</span>
                  <span className="mt-1 block text-muted">{row.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button type="submit" className="mt-3 w-full" disabled={saving}>
          {saving ? t("loading") : intro.save}
        </Button>
      </form>
      {audience === "parent" ? <StillLookingConfirm locale={loc} /> : null}
      <p className="mt-4 text-sm">
        <Link to="/unsubscribe" search={{ token: undefined, channel: undefined }} className="underline-offset-4 hover:underline">
          {intro.unsub}
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">{intro.apps}</p>
    </section>
  );
}

function StillLookingConfirm({ locale }: { locale: AlertLocale }) {
  const copy = stillLookingCopy(locale);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function send(looking: boolean) {
    setBusy(true);
    void confirmStillLooking({ data: { looking } })
      .then(() => setNote(copy.saved))
      .catch(() => setNote(""))
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-4 rounded-lg bg-bg p-3 ring-1 ring-border">
      <p className="text-sm text-fg">{copy.ask}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => send(true)}>
          {copy.yes}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => send(false)}>
          {copy.no}
        </Button>
      </div>
      {note ? (
        <p className="mt-2 text-sm text-muted" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
