import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BillingIntervalToggle } from "@/components/billing-interval-toggle";
import { UpgradePlanCard } from "@/components/upgrade-plan-card";
import { useCopy } from "@/lib/use-copy";
import { ALERTS_MONTHLY_CAD, ALERTS_YEARLY_CAD, PLUS_MONTHLY_CAD, PLUS_YEARLY_CAD } from "@/lib/parent-plus";
import { PROVIDER_ADDONS, PROVIDER_PLANS } from "@/lib/provider-plans";
import { getUpgradePriceFlags } from "@/lib/server/upgrade-prices";
import {
  DAYCARE_UPGRADE_PLANS,
  PARENT_UPGRADE_PLANS,
  formatPlanCad,
  paidPlanVisible,
  visibleYearlySavings,
} from "@/lib/upgrade-plans";

const COPY = {
  en: {
    kicker: "Optional",
    title: "KidEase is free",
    lead: "Search, messages, listings, vacancy, and claim stay free for parents and daycares across Canada. These upgrades are optional and billed in Canadian dollars.",
    families: "For families",
    daycares: "For daycares",
    signParent: "Sign in for Parent Plus",
    signDaycare: "Sign in for centre plans",
    openParent: "Open Parent Plus",
    openDaycare: "Open centre plans",
    openNetwork: "Open Network",
    signNetwork: "Sign in for Network",
    openAlerts: "Open Parent Alerts",
    signAlerts: "Sign in for Parent Alerts",
  },
  fr: {
    kicker: "Facultatif",
    title: "KidEase est gratuit",
    lead: "La recherche, les messages, la fiche, les places et la réclamation restent gratuits pour les parents et les garderies au Canada. Ces options sont facultatives et facturées en dollars canadiens.",
    families: "Pour les familles",
    daycares: "Pour les garderies",
    signParent: "Connexion pour Plus parents",
    signDaycare: "Connexion pour les forfaits centre",
    openParent: "Ouvrir Plus parents",
    openDaycare: "Ouvrir les forfaits centre",
    openNetwork: "Ouvrir Réseau",
    signNetwork: "Connexion pour Réseau",
    openAlerts: "Ouvrir Alertes parents",
    signAlerts: "Connexion pour Alertes parents",
  },
} as const;

function planCtaClass(primary: boolean) {
  return primary
    ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
    : "inline-flex min-h-11 items-center text-sm font-medium text-primary";
}

export function OptionalUpgrades({
  side = "both",
  signedIn = false,
  initialFlags = null,
}: {
  side?: "parent" | "daycare" | "both";
  signedIn?: boolean;
  initialFlags?: Record<string, boolean> | null;
}) {
  const { locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const t = COPY[loc];
  const showFamilies = side === "both" || side === "parent";
  const showDaycares = side === "both" || side === "daycare";
  const [flags, setFlags] = useState<Record<string, boolean> | null>(initialFlags);
  const [parentInterval, setParentInterval] = useState<"month" | "year">("year");
  const [daycareInterval, setDaycareInterval] = useState<"month" | "year">("year");
  useEffect(() => {
    void getUpgradePriceFlags()
      .then((next) => setFlags(next))
      .catch(() => setFlags({}));
  }, []);
  const prices = Object.fromEntries(PROVIDER_PLANS.map((plan) => [plan.id, plan]));
  const familyPlans = PARENT_UPGRADE_PLANS.filter((plan) => paidPlanVisible(plan.id, parentInterval, flags));
  const daycarePlans = DAYCARE_UPGRADE_PLANS.filter((plan) => paidPlanVisible(plan.id, daycareInterval, flags));
  return (
    <section className="ke-gutter mx-auto max-w-6xl py-12" data-ke="optional-upgrades">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.kicker}</p>
      <h2 className="mt-2 font-display text-2xl">{t.title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t.lead}</p>
      <div className="mt-6 space-y-8">
        {showFamilies ? (
          <div data-ke="upgrades-families">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.families}</p>
            <div className="mt-3">
              <BillingIntervalToggle
                interval={parentInterval}
                onChange={setParentInterval}
                savePercents={visibleYearlySavings(
                  PARENT_UPGRADE_PLANS.map((plan) => plan.id),
                  flags,
                )}
                locale={loc}
              />
            </div>
            <div className={familyPlans.length > 2 ? "mt-3 grid gap-3 lg:grid-cols-3" : "mt-3 grid gap-3 sm:grid-cols-2"}>
              {familyPlans.map((plan) => {
                const amount =
                  plan.id === "alerts"
                    ? { monthly: ALERTS_MONTHLY_CAD, yearly: ALERTS_YEARLY_CAD }
                    : plan.id === "plus"
                      ? { monthly: PLUS_MONTHLY_CAD, yearly: PLUS_YEARLY_CAD }
                      : { monthly: 0, yearly: null };
                const label = plan.id === "alerts" ? (signedIn ? t.openAlerts : t.signAlerts) : signedIn ? t.openParent : t.signParent;
                return (
                  <UpgradePlanCard
                    key={plan.id}
                    plan={plan}
                    locale={loc}
                    interval={parentInterval}
                    monthly={amount.monthly}
                    yearly={amount.yearly}
                    cta={
                      plan.id === "free" ? null : signedIn ? (
                        <Link to="/parent" search={{ tab: "payments" }} className={planCtaClass(plan.recommended)}>
                          {label}
                        </Link>
                      ) : (
                        <Link
                          to="/login"
                          search={{ role: "parent", desk: "parent", intent: "in", next: "/parent?tab=payments" }}
                          className={planCtaClass(plan.recommended)}
                        >
                          {label}
                        </Link>
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
        ) : null}
        {showDaycares ? (
          <div data-ke="upgrades-daycares">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.daycares}</p>
            <div className="mt-3">
              <BillingIntervalToggle
                interval={daycareInterval}
                onChange={setDaycareInterval}
                savePercents={visibleYearlySavings(
                  DAYCARE_UPGRADE_PLANS.map((plan) => plan.id),
                  flags,
                )}
                locale={loc}
              />
            </div>
            <div className={daycarePlans.length > 2 ? "mt-3 grid gap-3 lg:grid-cols-3" : "mt-3 grid gap-3 sm:grid-cols-2"}>
              {daycarePlans.map((plan) => {
                const price = prices[plan.id];
                const primary = plan.recommended;
                const label = plan.id === "network" ? (signedIn ? t.openNetwork : t.signNetwork) : signedIn ? t.openDaycare : t.signDaycare;
                return (
                  <UpgradePlanCard
                    key={plan.id}
                    plan={plan}
                    locale={loc}
                    interval={daycareInterval}
                    monthly={price?.monthly ?? 0}
                    yearly={price?.yearly}
                    perSite={price?.perSite}
                    cta={
                      plan.id === "free" ? null : signedIn ? (
                        <Link to="/provider/subscription" className={planCtaClass(primary)}>
                          {label}
                        </Link>
                      ) : (
                        <Link
                          to="/login"
                          search={{ role: "provider", desk: "director", intent: "in", next: "/provider/subscription" }}
                          className={planCtaClass(primary)}
                        >
                          {label}
                        </Link>
                      )
                    }
                  />
                );
              })}
            </div>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {PROVIDER_ADDONS.map((addon) => (
                <li key={addon.id}>
                  {addon.name[loc]} · {formatPlanCad(addon.amount, loc)}
                  {addon.cadence === "once" ? (loc === "fr" ? " une fois" : " once") : loc === "fr" ? " / mois" : " / month"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
