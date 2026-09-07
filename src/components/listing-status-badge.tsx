import { listingStatusFromClaim, listingStatusLabel } from "@/lib/listing-status";
import { useCopy } from "@/lib/use-copy";
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

export type LedgerSurface = "money" | "parent" | "booking" | "bill";

export function LedgerHonesty({
  stripeLive,
  className,
  surface = "money",
}: {
  stripeLive: boolean;
  className?: string;
  surface?: LedgerSurface;
}) {
  const { t } = useCopy();
  const text =
    surface === "parent"
      ? stripeLive
        ? t("ledgerLiveParent")
        : t("ledgerOffParent")
      : surface === "booking"
        ? stripeLive
          ? t("ledgerLiveBooking")
          : t("ledgerOffBooking")
        : surface === "bill"
          ? stripeLive
            ? t("ledgerLiveBill")
            : t("ledgerOffBill")
          : stripeLive
            ? t("ledgerLiveMoney")
            : t("ledgerOffMoney");
  return <p className={cn("text-sm text-muted", className)}>{text}</p>;
}
