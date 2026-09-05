import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Harmless Production check: signed-in admin hits GET /api/admin/sentry-test.
 */
export function AdminSentryTest() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function send() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/admin/sentry-test", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; enabled?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setNote(data.error || "Request failed");
        return;
      }
      setNote(
        data.enabled
          ? "Sent KidEase Sentry test. Check the Sentry Inbox."
          : "App booted; no DSN is set so nothing was sent.",
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl bg-surface p-4 ring-1 ring-border">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Sentry</p>
      <p className="mt-1 text-sm text-muted">
        Send a harmless test exception to confirm Production ingest. Same admin session gate as
        other /api/admin tools.
      </p>
      <Button type="button" className="mt-3" disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send Sentry test"}
      </Button>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
