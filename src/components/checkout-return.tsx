import { useEffect, useState } from "react";
import { confirmSuccess } from "@/lib/success-confirm";
import { upgradeConfirmed, upgradeSuccessTitle } from "@/lib/stripe-subscription-route";

export type UpgradeReturn =
  | { phase: "cancel" }
  | { phase: "success"; kind: "plan" | "addon" | "plus"; item: string | null; sessionId: string | null };

export function readUpgradeReturn(search: string): UpgradeReturn | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("checkout") === "cancel" || params.get("addon") === "cancel" || params.get("plus") === "cancel") {
    return { phase: "cancel" };
  }
  const sessionId = params.get("session");
  if (params.get("checkout") === "success") {
    return { phase: "success", kind: "plan", item: params.get("plan"), sessionId };
  }
  if (params.get("addon") === "success") {
    return { phase: "success", kind: "addon", item: params.get("item"), sessionId };
  }
  if (params.get("plus") === "success") {
    return { phase: "success", kind: "plus", item: "plus", sessionId };
  }
  return null;
}

const PENDING = {
  en: "Stripe has your payment. KidEase is confirming it on this page. This upgrade stays off until that confirmation lands.",
  fr: "Stripe a reçu le paiement. KidEase le confirme sur cette page. Cette option reste fermée tant que la confirmation n’est pas arrivée.",
} as const;

const PENDING_SLOW = {
  en: "Still waiting on Stripe. Refresh in a minute, or open Manage billing. If the card was charged, the upgrade appears here when Stripe notifies KidEase. Nothing is marked paid before that.",
  fr: "Toujours en attente de Stripe. Actualisez dans une minute, ou ouvrez Gérer la facturation. Si la carte a été débitée, l’option apparaît ici quand Stripe prévient KidEase. Rien n’est marqué payé avant.",
} as const;

const CANCELED = {
  en: "Checkout canceled. Nothing was charged.",
  fr: "Paiement annulé. Rien n’a été débité.",
} as const;

const SUCCESS_BODY = {
  en: "KidEase stays free. This upgrade is optional.",
  fr: "KidEase reste gratuit. Cette option est facultative.",
} as const;

export function CheckoutReturnNote({
  phase,
  locale,
}: {
  phase: "pending" | "slow" | "cancel" | null;
  locale: "en" | "fr";
}) {
  if (!phase) return null;
  const copy = phase === "cancel" ? CANCELED : phase === "slow" ? PENDING_SLOW : PENDING;
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
  reload?: () => void;
}) {
  const [slow, setSlow] = useState(false);
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
    if (input.ret?.phase !== "success" || ready) return;
    const reload = input.reload;
    if (!reload) return;
    const timer = window.setInterval(reload, 2000);
    const slowTimer = window.setTimeout(() => setSlow(true), 20000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(slowTimer);
    };
  }, [input.ret, input.reload, ready]);

  useEffect(() => {
    if (!ready || input.ret?.phase !== "success") return;
    const key = `kidease-pay-success:${input.ret.kind}:${input.ret.sessionId || input.ret.item || "paid"}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* private mode still shows the screen once in this effect */
    }
    confirmSuccess({
      variant: "modal",
      title: upgradeSuccessTitle({ kind: input.ret.kind, item: input.ret.item, locale: input.locale }),
      body: SUCCESS_BODY[input.locale],
    });
  }, [ready, input.ret, input.locale]);

  if (input.ret?.phase === "cancel") return "cancel" as const;
  if (input.ret?.phase === "success" && !ready) return slow ? ("slow" as const) : ("pending" as const);
  return null;
}
