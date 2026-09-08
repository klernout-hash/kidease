import type { LeadKind, LeadStatus } from "@/lib/lead-requests";
import { leadKindCopyKey, leadStatusCopyKey } from "@/lib/lead-requests";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function LeadStatusChip({ status, className }: { status: LeadStatus; className?: string }) {
  const { t } = useCopy();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        leadTone(status),
        className,
      )}
    >
      {t(leadStatusCopyKey(status))}
    </span>
  );
}

export function LeadKindChip({ kind, className }: { kind: LeadKind; className?: string }) {
  const { t } = useCopy();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-border",
        className,
      )}
    >
      {t(leadKindCopyKey(kind))}
    </span>
  );
}

function leadTone(status: LeadStatus) {
  switch (status) {
    case "requested":
    case "received":
      return "bg-primary/10 text-primary ring-primary/20";
    case "confirmed":
    case "answered":
      return "bg-ok/10 text-ok ring-ok/20";
    case "declined":
      return "bg-danger/10 text-danger ring-danger/20";
    case "closed":
    default:
      return "bg-surface-2 text-muted ring-border";
  }
}
