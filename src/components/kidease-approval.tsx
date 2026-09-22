import { useCopy } from "@/lib/use-copy";

/**
 * Public approval strip. Statuses only.
 * Private licence scans and screening PDFs never reach this component.
 * Compact on purpose: the title and the three requirements stay readable.
 */
export function KidEaseApprovalStrip({
  eligible,
  audience = "public",
}: {
  eligible: boolean;
  audience?: "public" | "daycare";
}) {
  const { t } = useCopy();
  if (!eligible) return null;
  const checks = [t("kideaseApprovedLicence"), t("kideaseApprovedScreening"), t("kideaseApprovedLive")];
  return (
    <aside className="ke-trust" data-ke="kidease-approval" data-ke-approval-audience={audience}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{t("kideaseApprovedEyebrow")}</p>
        <p className="font-display text-[0.9rem] leading-5 tracking-tight text-fg">{t("kideaseApprovedTitle")}</p>
      </div>
      <p className="mt-0.5 text-[12px] leading-4 text-muted">
        {audience === "daycare" ? t("kideaseApprovedDaycareBody") : t("kideaseApprovedBody")}
      </p>
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
