import type { ReactNode } from "react";
import { DAYCARE_ADDONS, daycareAddonVisible, formatPlanCad, type DaycareAddon, type PlanLocale } from "@/lib/upgrade-plans";

function cadenceLabel(addon: DaycareAddon, locale: PlanLocale): string {
  if (addon.cadence === "once") return locale === "fr" ? "une fois" : "once";
  return locale === "fr" ? "/ mois" : "/ month";
}

/** Compact daycare-only add-ons. A row renders only when that Stripe price env var is set. */
export function DaycareAddons({
  locale,
  flags,
  action,
}: {
  locale: PlanLocale;
  flags: Partial<Record<string, boolean>> | null | undefined;
  action?: (addon: DaycareAddon) => ReactNode;
}) {
  const visible = DAYCARE_ADDONS.filter((addon) => daycareAddonVisible(addon.id, flags));
  if (!visible.length) return null;
  return (
    <div className="mt-4" data-ke="daycare-addons">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">
        {locale === "fr" ? "Options" : "Add-ons"}
      </p>
      <ul className="mt-2 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
        {visible.map((addon) => (
          <li key={addon.id} data-addon={addon.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{addon.name[locale]}</p>
              <p className="text-sm text-muted">{addon.benefit[locale]}</p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums">
              {formatPlanCad(addon.amountCad, locale)}
              <span className="ml-1 font-normal text-muted">{cadenceLabel(addon, locale)}</span>
            </p>
            {action ? <div className="shrink-0">{action(addon)}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
