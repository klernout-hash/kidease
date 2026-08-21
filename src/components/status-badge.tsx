import type { BookingStatus } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const KEY: Record<BookingStatus, "statusRequested" | "statusUnderReview" | "statusWaitlist" | "statusOffered" | "statusActive" | "statusCancelled" | "statusDeclined"> = {
  requested: "statusRequested",
  under_review: "statusUnderReview",
  waitlist: "statusWaitlist",
  accepted: "statusOffered",
  declined: "statusDeclined",
  active: "statusActive",
  cancelled: "statusCancelled",
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
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

function tone(status: BookingStatus) {
  switch (status) {
    case "requested":
      return "bg-primary/10 text-primary ring-primary/20";
    case "under_review":
      return "bg-surface-2 text-fg ring-border";
    case "accepted":
      return "bg-ok/10 text-ok ring-ok/20";
    case "active":
      return "bg-ok/10 text-ok ring-ok/20";
    case "waitlist":
      return "bg-surface-2 text-muted ring-border";
    case "declined":
    case "cancelled":
      return "bg-danger/10 text-danger ring-danger/20";
    default:
      return "bg-surface-2 text-muted ring-border";
  }
}
