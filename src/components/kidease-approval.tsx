import { useCopy } from "@/lib/use-copy";

/**
 * Public approval strip. Statuses only.
 * Private licence scans and screening PDFs never reach this component.
 * `panel` is the daycare desk. `inline` is one quiet line on the public listing.
 */
export function KidEaseApprovalStrip({
  eligible,
  audience = "public",
  variant = "panel",
}: {
  eligible: boolean;
  audience?: "public" | "daycare";
  variant?: "panel" | "inline";
}) {
  const { t } = useCopy();
  if (!eligible) return null;
  const checks = [t("kideaseApprovedLicence"), t("kideaseApprovedScreening"), t("kideaseApprovedLive")];
  const body = audience === "daycare" ? t("kideaseApprovedDaycareBody") : t("kideaseApprovedBody");
  if (variant === "inline") {
    return (
      <span className="inline-flex items-baseline" data-ke="kidease-approval" data-ke-approval-audience={audience}>
        <span className="text-sm font-medium text-ok">{t("kideaseApprovedTitle")}</span>
        <span className="sr-only">
          {body} {checks.join(". ")}
        </span>
      </span>
    );
  }
  return (
    <aside className="ke-trust" data-ke="kidease-approval" data-ke-approval-audience={audience}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{t("kideaseApprovedEyebrow")}</p>
        <p className="font-display text-[0.9rem] leading-5 tracking-tight text-fg">{t("kideaseApprovedTitle")}</p>
      </div>
      <p className="mt-0.5 text-[12px] leading-4 text-muted">{body}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {checks.map((label) => (
          <li
            key={label}
            className="rounded-full bg-surface/90 px-1.5 py-px text-[10px] font-medium leading-4 text-fg ring-1 ring-primary/20"
          >
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
