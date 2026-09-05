import { listingStatusFromClaim, listingStatusLabel } from "@/lib/listing-status";
import { cn } from "@/lib/utils";

export function ListingStatusBadge({
  claimStatus,
  live,
  claimedAt,
  invert,
  className,
}: {
  claimStatus?: string | null;
  live?: boolean;
  claimedAt?: string | null;
  invert?: boolean;
  className?: string;
}) {
  const status = listingStatusFromClaim(claimStatus, { live, claimedAt });
  const label = listingStatusLabel(claimStatus, { live, claimedAt });
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        invert
          ? "bg-white/15 text-primary-fg"
          : status === "live"
            ? "bg-ok/15 text-ok"
            : status === "declined"
              ? "bg-danger/10 text-danger"
              : "bg-surface-2 text-muted",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function LedgerHonesty({ stripeLive, className }: { stripeLive: boolean; className?: string }) {
  return (
    <p className={cn("text-sm text-muted", className)}>
      {stripeLive
        ? "Stripe live keys are set — charges can settle."
        : "Internal ledger only. $0 here is not a Stripe balance, and parents cannot pay by card until live keys are on."}
    </p>
  );
}
