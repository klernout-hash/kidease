import { useState } from "react";
import { PARENT_UPGRADE_PLANS, DAYCARE_UPGRADE_PLANS, formatPlanCad } from "@/lib/upgrade-plans";
import { PROVIDER_PLANS } from "@/lib/provider-plans";
import { ALERTS_MONTHLY_CAD, PLUS_MONTHLY_CAD } from "@/lib/parent-plus";

/**
 * Static plan shelf for the signed-out preview fixture.
 * Live checkout stays on ProviderSubscriptionPanel and ParentPlusPanel.
 */
export function PlanChoiceShelf({ role }: { role: "parent" | "provider" }) {
  const [picked, setPicked] = useState<string | null>(null);
  const parent = role === "parent";
  const plans = parent ? PARENT_UPGRADE_PLANS : DAYCARE_UPGRADE_PLANS;

  if (picked) {
    return (
      <section className="rounded-2xl bg-surface px-4 py-6 ring-1 ring-border" data-ke="checkout-step">
        <h1 className="font-display text-3xl">Checkout</h1>
        <p className="mt-2 text-sm text-muted">
          {picked} · prices in CA$. This preview does not charge a card.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-ke="plan-shelf">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Upgrade</p>
        <h1 className="mt-1 font-display text-3xl">{parent ? "Parent Plus" : "Upgrade your centre"}</h1>
        <p className="mt-2 text-sm text-muted">
          {parent
            ? "You are on Free. Parent Plus is optional. Prices in CA$."
            : "You are on Free. Pro and Network are optional. This is not parent Plus. Prices in CA$."}
        </p>
      </div>
      <div className="grid gap-3">
        {plans.map((plan) => {
          const current = plan.id === "free";
          const amount = parent
            ? plan.id === "plus"
              ? PLUS_MONTHLY_CAD
              : plan.id === "alerts"
                ? ALERTS_MONTHLY_CAD
                : 0
            : (PROVIDER_PLANS.find((row) => row.id === plan.id)?.monthly ?? 0);
          return (
            <article
              key={plan.id}
              data-plan={plan.id}
              data-current={current ? "true" : "false"}
              className={
                current
                  ? "rounded-2xl bg-surface p-4 ring-2 ring-primary"
                  : "rounded-2xl bg-surface p-4 ring-1 ring-border"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{plan.name.en}</p>
                {current ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-fg">
                    Current plan
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-display text-3xl tabular-nums">
                {formatPlanCad(amount, "en")}
                <span className="ml-1 text-sm font-normal text-muted">/ month</span>
              </p>
              <p className="mt-2 text-sm text-muted">{plan.pitch.en}</p>
              {current ? (
                <p className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-surface text-sm font-semibold text-fg ring-1 ring-border">
                  Current plan
                </p>
              ) : (
                <button
                  type="button"
                  data-ke="plan-checkout"
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
                  onClick={() => setPicked(plan.name.en)}
                >
                  {parent && plan.id === "plus" ? "Start Parent Plus" : `Continue to checkout · ${plan.name.en}`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
