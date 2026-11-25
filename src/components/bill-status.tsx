import type { BillStatus } from "@/lib/bill";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const KEY: Record<BillStatus, "billDraft" | "billSent" | "billPaid" | "billVoid" | "billRefunded" | "billDisputed"> = {
  draft: "billDraft",
  sent: "billSent",
  paid: "billPaid",
  void: "billVoid",
  refunded: "billRefunded",
  disputed: "billDisputed",
};

export function BillStatusBadge({ status, className }: { status: BillStatus; className?: string }) {
  const { t } = useCopy();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone(status),
        className,
      )}
    >
      {t(KEY[status])}
    </span>
  );
}

function tone(status: BillStatus) {
  switch (status) {
    case "paid":
      return "bg-ok/10 text-ok ring-ok/20";
    case "sent":
      return "bg-primary/10 text-primary ring-primary/20";
    case "draft":
      return "bg-surface-2 text-muted ring-border";
    case "void":
    case "refunded":
    case "disputed":
      return "bg-danger/10 text-danger ring-danger/20";
    default:
      return "bg-surface-2 text-muted ring-border";
  }
}

type PaymentState = "processing" | "requires_action" | "failed";

const STATE_KEY: Record<PaymentState, "billStateProcessing" | "billStateAction" | "billStateFailed"> = {
  processing: "billStateProcessing",
  requires_action: "billStateAction",
  failed: "billStateFailed",
};

/** Stripe payment state on an open bill. Nothing when there is none. */
export function PaymentStateBadge({ state, className }: { state?: PaymentState | null; className?: string }) {
  const { t } = useCopy();
  if (!state) return null;
  return (
    <span
      data-ke="payment-state"
      data-state={state}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        state === "processing" ? "bg-surface-2 text-muted ring-border" : "bg-danger/10 text-danger ring-danger/20",
        className,
      )}
    >
      {t(STATE_KEY[state])}
    </span>
  );
}

/** One plain sentence for the parent about the payment state. */
export function PaymentStateNote({
  state,
  reason,
  className,
}: {
  state?: PaymentState | null;
  reason?: string | null;
  className?: string;
}) {
  const { t } = useCopy();
  if (!state) return null;
  const body =
    state === "processing" ? t("billProcessingBody") : state === "failed" ? t("billFailedBody") : t("billActionBody");
  return (
    <p className={cn("text-sm", state === "processing" ? "text-muted" : "text-danger", className)} role="status">
      {body}
      {state === "failed" && reason ? ` ${t("billFailedReason").replace("{reason}", reason)}` : ""}
    </p>
  );
}
