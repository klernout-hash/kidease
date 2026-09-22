import { useCopy } from "@/lib/use-copy";

/**
 * Public approval strip. Statuses only.
 * Private licence scans and screening PDFs never reach this component.
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
  return (
    <aside
      className="mt-4 rounded-2xl bg-soft px-4 py-3.5 ring-1 ring-primary/15 sm:px-5"
      data-ke="kidease-approval"
      data-ke-approval-audience={audience}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{t("kideaseApprovedEyebrow")}</p>
      <p className="mt-1 font-display text-xl tracking-tight text-fg sm:text-2xl">{t("kideaseApprovedTitle")}</p>
      <p className="mt-1 max-w-xl text-base leading-6 text-muted">
        {audience === "daycare" ? t("kideaseApprovedDaycareBody") : t("kideaseApprovedBody")}
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-base font-medium leading-6 text-fg sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-sm">
        <li>{t("kideaseApprovedLicence")}</li>
        <li>{t("kideaseApprovedScreening")}</li>
        <li>{t("kideaseApprovedLive")}</li>
      </ul>
    </aside>
  );
}
