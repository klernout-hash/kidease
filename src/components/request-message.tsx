import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequestSentDialog } from "@/components/request-sent-dialog";
import { useLiveSubmit } from "@/components/use-live-submit";
import { openConversation } from "@/lib/server/family";
import { sendConnectedMessage } from "@/lib/server/inbox";
import { holdSendBeat, requestSentThumb } from "@/lib/request-sent";
import { capturePostHogEvent } from "@/lib/posthog";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

type Props = {
  daycare: Daycare;
  open: boolean;
  onClose: () => void;
};

export function RequestMessageSheet({ daycare, open, onClose }: Props) {
  const { t, locale } = useCopy();
  const titleId = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ conversationId: string } | null>(null);
  const opened = useRef(false);
  const send = useLiveSubmit(open);

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    const justOpened = !opened.current;
    opened.current = true;
    if (justOpened) {
      setDone(null);
      setError(null);
      setBody("");
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const name = locale === "fr" ? daycare.nameFr : daycare.name;

  if (done) {
    return (
      <RequestSentDialog
        kind="message"
        listingName={name}
        city={daycare.city}
        photo={requestSentThumb(daycare.photos)}
        conversationId={done.conversationId}
        canOpenMessages
        onClose={() => {
          setDone(null);
          onClose();
        }}
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const token = send.start();
    setBusy(true);
    setError(null);
    try {
      const thread = await openConversation({ data: daycare.id });
      const sent = await sendConnectedMessage({ data: { conversationId: thread.id, body: text } });
      if (!sent.ok) throw new Error(t("requestSentFailed"));
      capturePostHogEvent("listing_request_submitted", { intent: "message" });
      await holdSendBeat();
      if (!send.live(token)) return;
      setDone({ conversationId: thread.id });
    } catch (err) {
      if (!send.live(token)) return;
      const message = err instanceof Error ? err.message : t("requestSentFailed");
      setError(message);
      toast.error(message);
    } finally {
      if (send.live(token)) setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-fg/40"
        aria-label={t("cancel")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:rounded-xl"
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void submit(e)}>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-xl">
                {t("message")}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t("cancel")}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <p className="text-sm text-muted">{t("messageSheetLead").replace("{name}", name)}</p>
            <label className="block text-sm">
              {t("messageLabel")}
              <textarea
                required
                rows={4}
                className="mt-1 min-h-28 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={body}
                placeholder={t("messagePh")}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {error ? (
              <p className="text-sm text-danger" role="alert" data-ke="request-message-error">
                {error}
              </p>
            ) : null}
          </div>
          <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !body.trim()}
              size="lg"
              aria-busy={busy || undefined}
              aria-label={busy ? t("requestSentSending") : undefined}
            >
              {busy ? "…" : t("send")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
