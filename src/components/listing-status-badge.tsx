import { useRoleChrome } from "@/components/role-chrome";
import { parentPayLeadKey } from "@/lib/copy";
import { listingStatusFromClaim, listingStatusLabel } from "@/lib/listing-status";
import { useCopy } from "@/lib/use-copy";
import { useStoreShell } from "@/lib/use-native-shell";
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
  ready = true,
  plansOn = false,
}: {
  stripeLive: boolean;
  className?: string;
  surface?: LedgerSurface;
  ready?: boolean;
  /** Plan sentences stay hidden unless subscriptions are on and this is the website. */
  plansOn?: boolean;
}) {
  const { t } = useCopy();
  const storeShell = useStoreShell();
  const chrome = useRoleChrome();
  if (!ready) {
    return (
      <p className={cn("text-sm text-muted", className)} aria-busy="true">
        {t("moneyModeLoading")}
      </p>
    );
  }
  const subscriptionsOn = surface === "parent" ? plansOn : plansOn || chrome.subscriptionsEnabled === true;
  const showPlans = !storeShell && subscriptionsOn;
  if (surface === "money" && !showPlans) return null;
  const text =
    surface === "parent"
      ? t(parentPayLeadKey(showPlans, stripeLive))
      : surface === "booking"
        ? stripeLive
          ? t(showPlans ? "ledgerLiveBooking" : "ledgerLiveParentBills")
          : t("ledgerOffBooking")
        : surface === "bill"
          ? stripeLive
            ? t(showPlans ? "ledgerLiveBill" : "ledgerLiveParentBills")
            : t("ledgerOffBill")
          : stripeLive
            ? t("ledgerLiveMoney")
            : t("ledgerOffMoney");
  return <p className={cn("text-sm text-muted", className)}>{text}</p>;
}
