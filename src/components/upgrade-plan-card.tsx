import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  RECOMMENDED_LABEL,
  formatPlanCad,
  yearlySavingsLine,
  type PlanLocale,
  type UpgradePlanCopy,
} from "@/lib/upgrade-plans";

export function UpgradePlanCard({
  plan,
  locale,
  monthly,
  yearly,
  perSite = false,
  cta,
}: {
  plan: UpgradePlanCopy;
  locale: PlanLocale;
  monthly: number;
  yearly?: number | null;
  perSite?: boolean;
  cta?: ReactNode;
}) {
  const savings = perSite ? null : yearlySavingsLine(monthly, yearly, locale);
  const price = formatPlanCad(monthly, locale);
  const unit =
    perSite
      ? locale === "fr"
        ? "/ site / mois"
        : "/ site / month"
      : locale === "fr"
        ? "/ mois"
        : "/ month";
  return (
    <article
      data-ke={plan.recommended ? "plan-recommended" : "plan-card"}
      data-plan={plan.id}
      className={cn(
        "flex h-full flex-col rounded-2xl bg-surface p-4 ring-1",
        plan.recommended ? "ring-primary/40" : "ring-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{plan.name[locale]}</p>
        {plan.recommended ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {RECOMMENDED_LABEL[locale]}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl tabular-nums leading-none">
        {price}
        <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
      </p>
      {savings ? <p className="mt-2 text-xs text-muted">{savings}</p> : null}
      <p className="mt-3 text-sm text-muted">{plan.pitch[locale]}</p>
      <ul className="mt-3 flex-1 space-y-1.5 text-sm">
        {plan.benefits.map((benefit) => (
          <li key={benefit.en} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} />
            <span>{benefit[locale]}</span>
          </li>
        ))}
      </ul>
      {cta ? <div className="mt-4">{cta}</div> : null}
    </article>
  );
}
