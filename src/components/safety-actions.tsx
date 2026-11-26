import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Ban, Flag } from "lucide-react";
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
import { blockDialogText } from "@/lib/safety";
import { setThreadBlocked, subscribeThreadBlocks, threadBlocked } from "@/lib/thread-block-state";
import { useCopy } from "@/lib/use-copy";

export function SafetyReportButton({
  target,
  daycareId,
  conversationId,
  reviewId,
  variant = "link",
}: {
  target: SafetyTarget;
  daycareId?: string;
  conversationId?: string;
  reviewId?: string;
  /** "icon" is the 44px header control; the form opens in a dialog. */
  variant?: "link" | "icon";
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
    if (variant === "icon") return null;
    return (
      <a
        href="/login?intent=in"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {text.signIn}
      </a>
    );
  }

  if (!open && variant === "icon") {
    return (
      <button
        type="button"
        data-ke={`safety-report-${target}`}
        aria-label={label}
        title={label}
        className={ICON_BUTTON}
        onClick={() => setOpen(true)}
      >
        <Flag className="size-5" aria-hidden />
      </button>
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

  const form = (
    <form
      className={
        variant === "icon"
          ? "w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 text-sm shadow-lift ring-1 ring-border"
          : "mt-3 space-y-3 rounded-lg bg-surface p-4 text-sm ring-1 ring-border"
      }
      role={variant === "icon" ? "dialog" : undefined}
      aria-modal={variant === "icon" ? true : undefined}
      aria-label={variant === "icon" ? label : undefined}
      onClick={variant === "icon" ? (event) => event.stopPropagation() : undefined}
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
  if (variant !== "icon") return form;
  return (
    <div
      className="ke-safe-x fixed inset-0 z-[90] grid place-items-end bg-black/40 py-4 [--ke-pad-x:1rem] sm:place-items-center"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      {form}
    </div>
  );
}

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 touch-manipulation";

export function BlockMessagesButton({
  conversationId,
  side = "daycare",
  variant = "link",
}: {
  conversationId: string;
  side?: "daycare" | "family";
  variant?: "link" | "icon";
}) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useThreadBlocked(conversationId);
  const words = blockDialogText(locale, side);
  const label = blocked ? text.unblockPerson : words.trigger;

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
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        className={
          variant === "icon"
            ? ICON_BUTTON
            : "inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline disabled:opacity-50"
        }
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
        {variant === "icon" ? <Ban className={blocked ? "size-5 text-danger" : "size-5"} aria-hidden /> : label}
      </button>
      {open ? (
        <div className="ke-safe-x fixed inset-0 z-[90] grid place-items-end bg-black/40 py-4 [--ke-pad-x:1rem] sm:place-items-center" role="presentation" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-thread-title"
            className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-lift ring-1 ring-border"
            data-ke="block-confirm"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="block-thread-title" className="font-display text-xl">{words.title}</h2>
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
                {words.confirm}
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

/**
 * Whether the viewer blocked this conversation. Every block control and the
 * composer on the page share one value, so blocking from the header locks
 * sending at once and unblocking opens it again.
 */
export function useThreadBlocked(
  conversationId: string,
  opts?: { load?: boolean },
): [boolean, (next: boolean) => void] {
  const load = Boolean(opts?.load && conversationId);
  useEffect(() => {
    if (!load) return;
    let live = true;
    void safetyThreadState({ data: { conversationId } })
      .then((row) => {
        if (live) setThreadBlocked(conversationId, Boolean(row.blocked));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [conversationId, load]);
  const blocked = useSyncExternalStore(
    subscribeThreadBlocks,
    () => threadBlocked(conversationId),
    () => false,
  );
  const set = useCallback((next: boolean) => setThreadBlocked(conversationId, next), [conversationId]);
  return [blocked, set];
}
