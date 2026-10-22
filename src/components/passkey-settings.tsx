import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listSavedPasskeys,
  passkeyWasCancelled,
  registerPasskey,
  removeSavedPasskey,
  type SavedPasskey,
  PasskeyRequestError,
} from "@/lib/passkey-client";
import { useCopy } from "@/lib/use-copy";

function whenLabel(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PasskeySettings() {
  const { t, locale } = useCopy();
  const [rows, setRows] = useState<SavedPasskey[] | null>(null);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listSavedPasskeys()
      .then((next) => {
        if (live) setRows(next);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, []);

  function messageFor(err: unknown): string {
    if (err instanceof PasskeyRequestError && (err.code === "PASSKEY_RATE_LIMIT" || err.status === 429)) {
      return t("passkeyRateLimited");
    }
    if (err instanceof PasskeyRequestError && err.code === "PASSKEY_UNSUPPORTED") return t("passkeyUnsupported");
    return t("passkeyFailed");
  }

  async function onAdd() {
    setBusy("add");
    setError(null);
    try {
      await registerPasskey();
      setRows(await listSavedPasskeys());
      toast.success(t("passkeyAdded"));
    } catch (err) {
      if (!passkeyWasCancelled(err)) setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(id: string) {
    setBusy("remove");
    setError(null);
    try {
      await removeSavedPasskey(id);
      setRows((current) => (current || []).filter((row) => row.id !== id));
      setPending(null);
      toast.success(t("passkeyRemoved"));
    } catch (err) {
      if (!passkeyWasCancelled(err)) setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="passkey-settings">
      <h2 className="font-display text-lg tracking-[-0.02em]">{t("passkeySettingsTitle")}</h2>
      <p className="text-[13px] text-muted">{t("passkeySettingsLead")}</p>
      {rows && rows.length === 0 ? <p className="text-sm text-muted">{t("passkeyNone")}</p> : null}
      <ul className="space-y-2">
        {(rows || []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.deviceName || t("passkeyThisDevice")}</p>
              <p className="text-xs text-muted">
                {row.lastUsedAt
                  ? t("passkeyLastUsed").replace("{when}", whenLabel(locale, row.lastUsedAt))
                  : t("passkeyAddedOn").replace("{when}", whenLabel(locale, row.createdAt))}
              </p>
            </div>
            <Button
              type="button"
              variant={pending === row.id ? "danger" : "secondary"}
              className="min-h-11 min-w-11"
              disabled={busy !== null}
              onClick={() => {
                if (pending === row.id) void onRemove(row.id);
                else setPending(row.id);
              }}
            >
              {pending === row.id ? t("passkeyRemoveConfirm") : t("passkeyRemove")}
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="secondary" className="w-full min-h-11" disabled={busy !== null} onClick={() => void onAdd()}>
        {busy === "add" ? t("accountSaving") : t("passkeyAdd")}
      </Button>
    </section>
  );
}
