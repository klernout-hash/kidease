import { useEffect, useState } from "react";
import { confirmSuccess } from "@/lib/success-confirm";
import { upgradeConfirmed, upgradeSuccessHeadline, upgradeSuccessTitle } from "@/lib/stripe-subscription-route";
import { upgradeUnlockedBenefits } from "@/lib/upgrade-plans";
import {
  UPGRADE_CONFIRM_POLL_MS,
  UPGRADE_CONFIRM_SLOW,
  UPGRADE_CONFIRM_WAIT_MS,
  UPGRADE_CONFIRMING,
  stripUpgradeReturnQuery,
  upgradeCelebrationKey,
  type UpgradeReturn,
} from "@/lib/upgrade-return";

export {
  readUpgradeReturn,
  stripUpgradeReturnQuery,
  upgradeCelebrationKey,
  upgradeReturnFromSearch,
  UPGRADE_CONFIRM_POLL_MS,
  UPGRADE_CONFIRM_SLOW,
  UPGRADE_CONFIRM_WAIT_MS,
  UPGRADE_CONFIRMING,
} from "@/lib/upgrade-return";
export type { UpgradeReturn, UpgradeSearch } from "@/lib/upgrade-return";

const CANCELED = {
  en: "Checkout canceled. Nothing was charged.",
  fr: "Paiement annulé. Rien n’a été débité.",
} as const;

function celebrationSeen(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markCelebration(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* Private mode still strips the return URL after the badge is shown. */
  }
}

function replaceUpgradeReturn() {
  if (typeof window === "undefined") return;
  const next = stripUpgradeReturnQuery(window.location.search);
  const url = `${window.location.pathname}${next}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", url);
  }
}

export function CheckoutReturnNote({
  phase,
  locale,
}: {
  phase: "pending" | "slow" | "cancel" | null;
  locale: "en" | "fr";
}) {
  if (!phase) return null;
  const copy = phase === "cancel" ? CANCELED : phase === "slow" ? UPGRADE_CONFIRM_SLOW : UPGRADE_CONFIRMING;
  return (
    <p
      role="status"
      className={
        phase === "cancel"
          ? "rounded-xl bg-bg px-4 py-3 text-sm text-muted ring-1 ring-border"
          : "rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary ring-1 ring-primary/20"
      }
      data-ke={phase === "cancel" ? "checkout-cancel" : "checkout-pending"}
    >
      {copy[locale]}
    </p>
  );
}

export function useUpgradeCelebration(input: {
  ret: UpgradeReturn | null;
  locale: "en" | "fr";
  confirmedSessionId?: string | null;
  entitledPlan?: string | null;
  subscriptionStatus?: string | null;
  featuredCityStatus?: string | null;
  claimBoostPaymentId?: string | null;
  jobPostPaymentIds?: string | null;
  plusPlan?: string | null;
  plusStatus?: string | null;
  place?: string | null;
  reload?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  const [seen, setSeen] = useState(false);
  const ready =
    input.ret?.phase === "success" &&
    upgradeConfirmed({
      kind: input.ret.kind,
      item: input.ret.item,
      sessionId: input.ret.sessionId,
      confirmedSessionId: input.confirmedSessionId,
      entitledPlan: input.entitledPlan,
      subscriptionStatus: input.subscriptionStatus,
      featuredCityStatus: input.featuredCityStatus,
      claimBoostPaymentId: input.claimBoostPaymentId,
      jobPostPaymentIds: input.jobPostPaymentIds,
      plusPlan: input.plusPlan,
      plusStatus: input.plusStatus,
    });

  useEffect(() => {
    if (input.ret?.phase !== "success") return;
    if (celebrationSeen(upgradeCelebrationKey(input.ret))) {
      setSeen(true);
      replaceUpgradeReturn();
    }
  }, [input.ret]);

  useEffect(() => {
    if (seen || input.ret?.phase !== "success" || ready) return;
    const reload = input.reload;
    if (!reload) return;
    const timer = window.setInterval(reload, UPGRADE_CONFIRM_POLL_MS);
    const slowTimer = window.setTimeout(() => setSlow(true), UPGRADE_CONFIRM_WAIT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(slowTimer);
    };
  }, [seen, input.ret, input.reload, ready]);

  useEffect(() => {
    if (seen || !ready || input.ret?.phase !== "success") return;
    const key = upgradeCelebrationKey(input.ret);
    if (celebrationSeen(key)) {
      setSeen(true);
      replaceUpgradeReturn();
      return;
    }
    markCelebration(key);
    confirmSuccess({
      variant: "modal",
      title: upgradeSuccessHeadline(input.locale),
      body: upgradeSuccessTitle({
        kind: input.ret.kind,
        item: input.ret.item,
        interval: input.ret.interval,
        locale: input.locale,
        place: input.place,
      }),
      points: upgradeUnlockedBenefits({
        kind: input.ret.kind,
        item: input.ret.item,
        locale: input.locale,
      }),
    });
    replaceUpgradeReturn();
  }, [seen, ready, input.ret, input.locale, input.place]);

  if (seen) return null;
  if (input.ret?.phase === "cancel") return "cancel" as const;
  if (input.ret?.phase === "success" && !ready) return slow ? ("slow" as const) : ("pending" as const);
  return null;
}
