import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicPayMessage } from "@/lib/stripe-public-error";
import { CheckoutReturnNote, upgradeReturnFromSearch, useUpgradeCelebration, type UpgradeSearch } from "@/components/checkout-return";
import { useCopy } from "@/lib/use-copy";
import { ALERTS_MONTHLY_CAD, ALERTS_YEARLY_CAD, PLUS_MONTHLY_CAD, PLUS_YEARLY_CAD, type PlusInterval, type PlusPlanId } from "@/lib/parent-plus";
import { PARENT_UPGRADE_PLANS, checkoutCtaLabel, paidPlanVisible, visibleYearlySavings } from "@/lib/upgrade-plans";
import { BillingIntervalToggle } from "@/components/billing-interval-toggle";
import { UpgradePlanCard } from "@/components/upgrade-plan-card";
import { getParentPlus, setParentPlusCancel, startParentPlusCheckout, startParentPlusPortal, type ParentPlusState } from "@/lib/server/parent-plus";
import { ManageBillingCard, announceCancel } from "@/components/manage-billing";
import { subscriptionAccessOpen } from "@/lib/subscription-lifecycle";
import { openStripeCheckout } from "@/lib/wallets";
import { CaslConsentFields } from "@/components/casl-consent-fields";
import { getMyCaslConsents, saveMyCaslConsents } from "@/lib/server/casl-consent-api";
import type { CaslPrefs } from "@/lib/casl";
import { useShowPayCtas } from "@/components/pay-chrome";

export function ParentPlusPanel({
  offerCheckout = true,
  plusReturn,
  upgradeSearch = null,
  billingReturn = false,
}: {
  offerCheckout?: boolean;
  plusReturn?: "success" | "cancel" | null;
  upgradeSearch?: UpgradeSearch | null;
  billingReturn?: boolean;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const showPay = useShowPayCtas();
  const [state, setState] = useState<ParentPlusState | null>(null);
  const [interval, setInterval] = useState<PlusInterval>("year");
  const [busy, setBusy] = useState(false);
  const [consents, setConsents] = useState<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });

  const payReturn = useMemo(
    () => upgradeReturnFromSearch(upgradeSearch ?? (plusReturn ? { plus: plusReturn } : null)),
    [upgradeSearch, plusReturn],
  );

  const reloadPlus = useCallback(() => {
    void getParentPlus()
      .then((s) => {
        setState(s);
        if (s.plan !== "free" && subscriptionAccessOpen(s.status)) setInterval(s.interval);
      })
      .catch(() => undefined);
  }, []);

  const returnPhase = useUpgradeCelebration({
    ret: showPay ? payReturn : null,
    locale: loc,
    confirmedSessionId: state?.catalogCheckoutSessionId,
    plusPlan: state?.plan,
    plusStatus: state?.status,
    reload: reloadPlus,
  });

  useEffect(() => {
    if (!billingReturn) return;
    const timer = window.setInterval(() => reloadPlus(), 2000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [billingReturn, reloadPlus]);

  useEffect(() => {
    if (!billingReturn || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [billingReturn]);

  useEffect(() => {
    reloadPlus();
    void getMyCaslConsents()
      .then((row) => {
        setConsents({
          smsService: row.smsService,
          emailService: row.emailService,
          emailCommercial: row.emailCommercial,
        });
      })
      .catch(() => undefined);
  }, [reloadPlus]);

  if (!state) return null;
  const current = state;
  const manageable = Boolean(current.stripeLive && current.subscriptionId && subscriptionAccessOpen(current.status) && current.plan !== "free");
  if (!showPay && !manageable) return null;

  const plusOn = subscriptionAccessOpen(state.status);
  const familyPlans = PARENT_UPGRADE_PLANS.filter((plan) => paidPlanVisible(plan.id, interval, state.prices));

  async function start(plan: PlusPlanId) {
    setBusy(true);
    try {
      await saveMyCaslConsents({
        data: { ...consents, locale: loc, method: "checkout_checkbox" },
      }).catch(() => undefined);
      const { url } = await startParentPlusCheckout({
        data: { interval, plan: plan === "alerts" ? "alerts" : "plus", locale: loc },
      });
      await openStripeCheckout(url);
    } catch (err) {
      toast.error(publicPayMessage(err, "Could not start Plus checkout"));
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    try {
      const { url } = await startParentPlusPortal();
      await openStripeCheckout(url);
    } catch (err) {
      toast.error(publicPayMessage(err, "Could not open billing portal"));
    } finally {
      setBusy(false);
    }
  }

  async function setCancel(cancel: boolean) {
    setBusy(true);
    try {
      const saved = await setParentPlusCancel({ data: { cancel } });
      reloadPlus();
      if (cancel && (current.plan === "plus" || current.plan === "alerts")) {
        announceCancel({ product: current.plan, periodEnd: saved.periodEnd, locale: loc });
      }
    } catch (err) {
      toast.error(publicPayMessage(err, loc === "fr" ? "L’abonnement n’a pas changé." : "The subscription was not changed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Upgrade</p>
      <h2 className="mt-1 font-display text-3xl">{t("parentPlusTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("parentPlusLead")}</p>
      {returnPhase ? (
        <div className="mt-3">
          <CheckoutReturnNote phase={returnPhase} locale={loc} />
        </div>
      ) : null}
      {manageable && (state.plan === "plus" || state.plan === "alerts") ? (
        <div className="mt-4">
          <ManageBillingCard
            locale={loc}
            product={state.plan}
            interval={state.interval}
            status={state.status}
            periodEnd={state.periodEnd}
            cancelAtPeriodEnd={state.cancelAtPeriodEnd}
            billingReturn={billingReturn}
            busy={busy}
            onPortal={() => void portal()}
            onCancel={() => void setCancel(true)}
            onResume={() => void setCancel(false)}
          />
        </div>
      ) : null}
      {showPay ? (
      <>
      <div className="mt-4">
        <BillingIntervalToggle
          interval={interval}
          onChange={setInterval}
          savePercents={visibleYearlySavings(
            PARENT_UPGRADE_PLANS.map((plan) => plan.id),
            state.prices,
          )}
          locale={loc}
        />
      </div>
      <div className="mt-4 rounded-lg bg-bg p-3 ring-1 ring-border">
        <CaslConsentFields value={consents} onChange={setConsents} showEmailService={false} />
      </div>
      <div className={familyPlans.length > 2 ? "mt-4 grid gap-3 lg:grid-cols-3" : "mt-4 grid gap-3 sm:grid-cols-2"} data-ke="parent-upgrade-plans">
        {familyPlans.map((plan) => {
          const amount =
            plan.id === "alerts"
              ? { monthly: ALERTS_MONTHLY_CAD, yearly: ALERTS_YEARLY_CAD }
              : plan.id === "plus"
                ? { monthly: PLUS_MONTHLY_CAD, yearly: PLUS_YEARLY_CAD }
                : { monthly: 0, yearly: null };
          const priceKey = plan.id === "alerts" ? (interval === "year" ? "parent_alerts_yearly" : "parent_alerts_monthly") : interval === "year" ? "plus_yearly" : "plus_monthly";
          const live = plan.id !== "free" && state.stripeLive && Boolean(state.prices[priceKey]);
          const current = state.plan === plan.id && state.interval === interval && (plusOn || !state.stripeLive);
          return (
            <UpgradePlanCard
              key={plan.id}
              plan={plan}
              locale={loc}
              interval={interval}
              monthly={amount.monthly}
              yearly={amount.yearly}
              current={current || (plan.id === "free" && state.plan === "free")}
              cta={
                plan.id === "free" ? (
                  <Button className="min-h-12 w-full" variant="secondary" disabled>
                    {state.plan === "free" ? (loc === "fr" ? "Forfait actuel" : "Current plan") : plan.name[loc]}
                  </Button>
                ) : (
                  <Button
                    className="min-h-12 w-full text-base"
                    data-ke={current ? undefined : "plan-checkout"}
                    variant={current ? "secondary" : "primary"}
                    disabled={busy || current || !live || !offerCheckout}
                    onClick={() => void start(plan.id as PlusPlanId)}
                  >
                    {current
                      ? t("parentPlusCurrent")
                      : interval === "year"
                        ? checkoutCtaLabel({
                            planName: plan.name[loc],
                            interval,
                            monthly: amount.monthly,
                            yearly: amount.yearly,
                            locale: loc,
                          })
                        : t("parentPlusSubscribe")}
                  </Button>
                )
              }
            />
          );
        })}
      </div>
      {!offerCheckout && !(state.plan !== "free" && plusOn) ? <p className="mt-3 text-sm text-muted">{t("parentPlusNoBill")}</p> : null}
      {showPay && !state.stripeLive ? <p className="mt-3 text-sm text-muted">{t("parentPlusRehearsal")}</p> : null}
      </>
      ) : null}
      {state.status ? <p className="mt-2 text-xs text-subtle">{state.status}</p> : null}
    </div>
  );
}
