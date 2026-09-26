import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicPayMessage } from "@/lib/stripe-public-error";
import { CheckoutReturnNote, readUpgradeReturn, useUpgradeCelebration } from "@/components/checkout-return";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { PLUS_MONTHLY_CAD, PLUS_YEARLY_CAD, plusPriceHint, type PlusInterval } from "@/lib/parent-plus";
import { parentUpgradePlan } from "@/lib/upgrade-plans";
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
  const [interval, setInterval] = useState<PlusInterval>("month");
  const [busy, setBusy] = useState(false);
  const [consents, setConsents] = useState<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });

  const payReturn = useMemo(() => {
    if (plusReturn === "success" || plusReturn === "cancel") {
      const session =
        typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("session");
      return plusReturn === "cancel"
        ? ({ phase: "cancel" } as const)
        : ({ phase: "success", kind: "plus", item: "plus", sessionId: session } as const);
    }
    return typeof window === "undefined" ? null : readUpgradeReturn(window.location.search);
  }, [plusReturn]);

  const reloadPlus = useCallback(() => {
    void getParentPlus()
      .then((s) => {
        setState(s);
        setInterval(s.interval);
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

  const live = state.stripeLive && Boolean(state.prices[interval === "year" ? "plus_yearly" : "plus_monthly"]);
  const plusOn = state.status === "active" || state.status === "trialing";
  const current = state.plan === "plus" && (plusOn || !state.stripeLive);

  async function start() {
    setBusy(true);
    try {
      await saveMyCaslConsents({
        data: { ...consents, locale: loc, method: "checkout_checkbox" },
      }).catch(() => undefined);
      const { url } = await startParentPlusCheckout({ data: { interval } });
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2" data-ke="parent-upgrade-plans">
        <UpgradePlanCard plan={parentUpgradePlan("free")} locale={loc} monthly={0} />
        <UpgradePlanCard
          plan={parentUpgradePlan("plus")}
          locale={loc}
          monthly={PLUS_MONTHLY_CAD}
          yearly={PLUS_YEARLY_CAD}
          cta={
            <>
              <div className="flex flex-wrap gap-2">
                {(["month", "year"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setInterval(id)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm",
                      interval === id ? "bg-primary text-primary-fg" : "bg-bg text-muted ring-1 ring-border hover:text-fg",
                    )}
                  >
                    {plusPriceHint(id, loc)}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-bg p-3 ring-1 ring-border">
                <CaslConsentFields value={consents} onChange={setConsents} showEmailService={false} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {live && offerCheckout ? (
                  <Button className="min-h-11 w-full" disabled={busy || current} onClick={() => void start()}>
                    {current ? t("parentPlusCurrent") : t("parentPlusSubscribe")}
                  </Button>
                ) : (
                  <Button className="min-h-11 w-full" disabled>
                    {t("parentPlusSubscribe")}
                  </Button>
                )}
                {state.customerId && state.stripeLive ? (
                  <Button className="min-h-11 w-full" variant="secondary" disabled={busy} onClick={() => void portal()}>
                    {t("parentPlusManage")}
                  </Button>
                ) : null}
              </div>
            </>
          }
        />
      </div>
      {!offerCheckout && !current ? <p className="mt-3 text-sm text-muted">{t("parentPlusNoBill")}</p> : null}
      {!state.stripeLive ? <p className="mt-3 text-sm text-muted">{t("parentPlusRehearsal")}</p> : null}
      {state.status ? <p className="mt-2 text-xs text-subtle">{state.status}</p> : null}
    </div>
  );
}
