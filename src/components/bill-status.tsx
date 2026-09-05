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
