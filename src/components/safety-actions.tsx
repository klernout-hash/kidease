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
}: {
  target: SafetyTarget;
  daycareId?: string;
  conversationId?: string;
}) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SafetyReason>("unsafe");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const label =
    target === "listing" ? text.reportListing : target === "centre" ? text.reportCentre : text.reportThread;

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
        void reportSafety({ data: { target, reason, detail, daycareId, conversationId } })
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

export function BlockMessagesButton({ conversationId }: { conversationId: string }) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const text = safetyText(locale);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void safetyThreadState({ data: { conversationId } })
      .then((state) => setBlocked(Boolean(state.blocked)))
      .catch(() => undefined);
  }, [conversationId, user]);

  if (!user) return null;

  return (
    <button
      type="button"
      data-ke="safety-block"
      disabled={busy}
      className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline disabled:opacity-50"
      onClick={() => {
        setBusy(true);
        void setMessageBlock({ data: { conversationId, blocked: !blocked } })
          .then((result) => {
            setBlocked(result.blocked);
            toast.success(result.blocked ? text.blockedNow : text.unblocked);
          })
          .catch(() => toast.error(text.blockedSend))
          .finally(() => setBusy(false));
      }}
    >
      {blocked ? text.unblock : text.block}
    </button>
  );
}
