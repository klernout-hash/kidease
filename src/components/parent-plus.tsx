import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicPayMessage } from "@/lib/stripe-public-error";
import { CheckoutReturnNote, readUpgradeReturn, useUpgradeCelebration } from "@/components/checkout-return";
import { useCopy } from "@/lib/use-copy";
import { ALERTS_MONTHLY_CAD, ALERTS_YEARLY_CAD, PLUS_MONTHLY_CAD, PLUS_YEARLY_CAD, type PlusInterval, type PlusPlanId } from "@/lib/parent-plus";
import { PARENT_UPGRADE_PLANS, checkoutCtaLabel, paidPlanVisible, visibleYearlySavings } from "@/lib/upgrade-plans";
import { BillingIntervalToggle } from "@/components/billing-interval-toggle";
import { UpgradePlanCard } from "@/components/upgrade-plan-card";
import { getParentPlus, startParentPlusCheckout, startParentPlusPortal, type ParentPlusState } from "@/lib/server/parent-plus";
import { CaslConsentFields } from "@/components/casl-consent-fields";
import { getMyCaslConsents, saveMyCaslConsents } from "@/lib/server/casl-consent-api";
import type { CaslPrefs } from "@/lib/casl";
import { openStripeCheckout } from "@/lib/wallets";
import { useShowPayCtas } from "@/components/pay-chrome";

export function ParentPlusPanel({
  offerCheckout = true,
  plusReturn,
}: {
  offerCheckout?: boolean;
  plusReturn?: "success" | "cancel" | null;
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

  const payReturn = useMemo(() => {
    if (plusReturn === "success" || plusReturn === "cancel") {
      const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
      const session = params?.get("session") ?? null;
      const plan = params?.get("plan") === "alerts" ? "alerts" : "plus";
      const picked = params?.get("interval") === "month" || params?.get("interval") === "year" ? params.get("interval") : null;
      return plusReturn === "cancel"
        ? ({ phase: "cancel" } as const)
        : ({ phase: "success", kind: "plus", item: plan, sessionId: session, interval: picked } as const);
    }
    return typeof window === "undefined" ? null : readUpgradeReturn(window.location.search);
  }, [plusReturn]);

  const reloadPlus = useCallback(() => {
    void getParentPlus()
      .then((s) => {
        setState(s);
        const paid = s.status === "active" || s.status === "trialing";
        if (s.plan !== "free" && paid) setInterval(s.interval);
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
    if (!showPay) return;
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
  }, [showPay, reloadPlus]);

  if (!showPay || !state) return null;

  const plusOn = state.status === "active" || state.status === "trialing";
  const familyPlans = PARENT_UPGRADE_PLANS.filter((plan) => paidPlanVisible(plan.id, interval, state.prices));

  async function start(plan: PlusPlanId) {
    setBusy(true);
    try {
      await saveMyCaslConsents({
        data: { ...consents, locale: loc, method: "checkout_checkbox" },
      }).catch(() => undefined);
      const { url } = await startParentPlusCheckout({ data: { interval, plan: plan === "alerts" ? "alerts" : "plus" } });
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
      window.location.assign(url);
    } catch (err) {
      toast.error(publicPayMessage(err, "Could not open billing portal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <h3 className="font-display text-xl">{t("parentPlusTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("parentPlusLead")}</p>
      {returnPhase ? (
        <div className="mt-3">
          <CheckoutReturnNote phase={returnPhase} locale={loc} />
        </div>
      ) : null}
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
              cta={
                plan.id === "free" ? null : (
                  <Button className="min-h-11 w-full" disabled={busy || current || !live || !offerCheckout} onClick={() => void start(plan.id as PlusPlanId)}>
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
      {state.customerId && state.stripeLive ? (
        <Button className="mt-3 min-h-11" variant="secondary" disabled={busy} onClick={() => void portal()}>
          {t("parentPlusManage")}
        </Button>
      ) : null}
      {!offerCheckout && !(state.plan !== "free" && plusOn) ? <p className="mt-3 text-sm text-muted">{t("parentPlusNoBill")}</p> : null}
      {!state.stripeLive ? <p className="mt-3 text-sm text-muted">{t("parentPlusRehearsal")}</p> : null}
      {state.status ? <p className="mt-2 text-xs text-subtle">{state.status}</p> : null}
    </div>
  );
}
