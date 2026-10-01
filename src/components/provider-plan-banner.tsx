import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { inquiryRemaining, type ProviderEntitlements } from "@/lib/provider-entitlements";
import { daycareCapPrompt } from "@/lib/upgrade-prompt";
import { providerPlan } from "@/lib/provider-plans";

export type ProviderDeskSubscription = {
  selectedPlan: ProviderEntitlements["selectedPlan"];
  entitledPlan: ProviderEntitlements["entitledPlan"];
  stripeLive: boolean;
  paid: boolean;
  analyticsDays: number;
  orgDashboard: boolean;
  unlimitedInquiries: boolean;
  featuredCity: boolean;
  inquiryCap: number | null;
  inquiryUsed: number;
  siteCount: number;
};

export function ProviderPlanBanner({ subscription }: { subscription: ProviderDeskSubscription }) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const plan = providerPlan(subscription.entitledPlan);
  const remaining = inquiryRemaining(subscription.inquiryUsed, subscription.inquiryCap);
  const cap = daycareCapPrompt(subscription.inquiryUsed, subscription.inquiryCap);
  const capCopy =
    cap === "at"
      ? t("daycareCapHit")
      : cap === "near"
        ? t("daycareCapNear")
            .replace("{used}", String(subscription.inquiryUsed))
            .replace("{cap}", String(subscription.inquiryCap ?? ""))
        : null;
  return (
    <section className="ke-digital-plan rounded-xl bg-surface px-5 py-4 ring-1 ring-border" data-ke="digital-plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("planCurrent")}</p>
          <p className="mt-1 inline-flex items-center gap-2 font-display text-2xl">
            <CreditCard className="size-5 text-primary" strokeWidth={1.8} />
            {plan.name[loc]}
          </p>
          <p className="mt-1 text-sm text-muted">
            {subscription.unlimitedInquiries
              ? t("planInquiryUnlimited")
              : `${t("planInquiryUsage")}: ${subscription.inquiryUsed}${
                  subscription.inquiryCap != null ? ` / ${subscription.inquiryCap}` : ""
                }${remaining != null ? ` · ${remaining} left` : ""}`}
          </p>
          {!subscription.stripeLive ? <p className="mt-2 text-sm text-muted">{t("planBillingPaused")}</p> : null}
        </div>
        {subscription.paid ? (
          <Link
            to="/provider/subscription"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
          >
            {t("planCurrent")}
          </Link>
        ) : capCopy ? (
          <div data-ke="daycare-cap-prompt" className="max-w-sm text-sm">
            <p>{capCopy}</p>
            <Link to="/provider/subscription" className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary">
              {t("planViewPlans")}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
