import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  RECOMMENDED_LABEL,
  formatPlanCad,
  yearlySavingsPercent,
  type PlanLocale,
  type UpgradePlanCopy,
} from "@/lib/upgrade-plans";

export function UpgradePlanCard({
  plan,
  locale,
  monthly,
  yearly,
  interval = "month",
  perSite = false,
  cta,
}: {
  plan: UpgradePlanCopy;
  locale: PlanLocale;
  monthly: number;
  yearly?: number | null;
  interval?: "month" | "year";
  perSite?: boolean;
  cta?: ReactNode;
}) {
  const yearlyMode = plan.id !== "free" && interval === "year" && yearly != null && yearly > 0;
  const percent = yearlyMode ? yearlySavingsPercent(monthly, yearly) : null;
  const price = formatPlanCad(yearlyMode ? yearly! : monthly, locale);
  const unit = perSite
    ? yearlyMode
      ? locale === "fr"
        ? "/ site / an"
        : "/ site / year"
      : locale === "fr"
        ? "/ site / mois"
        : "/ site / month"
    : yearlyMode
      ? locale === "fr"
        ? "/ an"
        : "/ year"
      : locale === "fr"
        ? "/ mois"
        : "/ month";
  return (
    <article
      data-ke={plan.recommended ? "plan-recommended" : "plan-card"}
      data-plan={plan.id}
      data-interval={yearlyMode ? "year" : "month"}
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
      {percent != null ? (
        <p className="mt-2 text-xs font-semibold text-primary" data-ke="plan-save">
          {locale === "fr" ? `Économisez ${percent} %` : `Save ${percent}%`}
        </p>
      ) : null}
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
