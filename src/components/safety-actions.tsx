import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  SAFETY_REASONS,
  safetyReasonLabel,
  safetyText,
  type SafetyReason,
  type SafetyTarget,
} from "@/lib/safety";
import { reportSafety, safetyThreadState, setMessageBlock } from "@/lib/server/safety";
import { useCopy } from "@/lib/use-copy";

export function SafetyReportButton({
  target,
  daycareId,
  conversationId,
  reviewId,
}: {
  target: SafetyTarget;
  daycareId?: string;
  conversationId?: string;
  reviewId?: string;
}) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SafetyReason>("unsafe");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const label =
    target === "review"
      ? text.reportReview
      : target === "listing"
        ? text.reportListing
        : target === "centre"
          ? text.reportCentre
          : text.reportThread;

  if (!user) {
    return (
      <a
        href="/login?intent=in"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {text.signIn}
      </a>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-ke={`safety-report-${target}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg bg-surface p-4 text-sm ring-1 ring-border"
      data-ke={`safety-report-form-${target}`}
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void reportSafety({ data: { target, reason, detail, daycareId, conversationId, reviewId } })
          .then(() => {
            toast.success(text.sent);
            setOpen(false);
            setDetail("");
          })
          .catch(() => toast.error(text.failed))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-medium">{label}</p>
      <label className="block">
        {text.reason}
        <select
          className="ke-input mt-1"
          value={reason}
          onChange={(event) => setReason(event.target.value as SafetyReason)}
        >
          {SAFETY_REASONS.map((id) => (
            <option key={id} value={id}>
              {safetyReasonLabel(locale, id)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {text.detail}
        <textarea
          className="ke-textarea mt-1"
          rows={3}
          maxLength={2000}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {text.send}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}

export function BlockMessagesButton({
  conversationId,
  side = "daycare",
}: {
  conversationId: string;
  side?: "daycare" | "family";
}) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const label = blocked ? text.unblockPerson : side === "family" ? text.blockFamily : text.blockDaycare;

  useEffect(() => {
    if (!user) return;
    void safetyThreadState({ data: { conversationId } })
      .then((state) => setBlocked(Boolean(state.blocked)))
      .catch(() => undefined);
  }, [conversationId, user]);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        data-ke="safety-block"
        disabled={busy}
        className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline disabled:opacity-50"
        onClick={() => {
          if (blocked) {
            setBusy(true);
            void setMessageBlock({ data: { conversationId, blocked: false } })
              .then(() => {
                setBlocked(false);
                toast.success(text.unblocked);
              })
              .catch(() => toast.error(text.failed))
              .finally(() => setBusy(false));
            return;
          }
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 p-4 sm:place-items-center" role="presentation" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-thread-title"
            className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-lift ring-1 ring-border"
            data-ke="block-confirm"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="block-thread-title" className="font-display text-xl">{text.blockConfirmTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{text.blockConfirmBody}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                data-ke="block-confirm-go"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void setMessageBlock({ data: { conversationId, blocked: true } })
                    .then(() => {
                      setBlocked(true);
                      toast.success(text.blockedNow);
                      setOpen(false);
                    })
                    .catch(() => toast.error(text.failed))
                    .finally(() => setBusy(false));
                }}
              >
                {text.blockConfirm}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {text.cancel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
