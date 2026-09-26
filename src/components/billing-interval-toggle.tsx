import { cn } from "@/lib/utils";
import { yearlySavingsToggleLabel, type PlanLocale } from "@/lib/upgrade-plans";

export function BillingIntervalToggle({
  interval,
  onChange,
  savePercents,
  locale,
}: {
  interval: "month" | "year";
  onChange: (next: "month" | "year") => void;
  savePercents: number[];
  locale: PlanLocale;
}) {
  const save = yearlySavingsToggleLabel(savePercents, locale);
  const label = {
    month: locale === "fr" ? "Mensuel" : "Monthly",
    year: locale === "fr" ? "Annuel" : "Yearly",
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-ke="billing-interval">
      {(["month", "year"] as const).map((id) => {
        const selected = interval === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-sm",
              selected ? "bg-primary text-primary-fg" : "bg-surface text-muted ring-1 ring-border hover:text-fg",
            )}
          >
            {label[id]}
            {id === "year" && save ? (
              <span
                className={cn(
                  "ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  selected ? "bg-primary-fg/15 text-primary-fg" : "bg-primary/10 text-primary",
                )}
              >
                {save}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
