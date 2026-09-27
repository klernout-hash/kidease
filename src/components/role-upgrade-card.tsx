import { Link } from "@tanstack/react-router";
import type { ChromeRole } from "@/lib/role-access";
import { useCopy } from "@/lib/use-copy";

/** Dedicated plan card. Free KidEase stays usable; this is the obvious way to the plans. */
export function RoleUpgradeCard({
  role,
  paid,
  planLabel,
  renewsOn,
}: {
  role: ChromeRole;
  paid: boolean;
  planLabel?: string | null;
  renewsOn?: string | null;
}) {
  const { locale, t } = useCopy();
  if (role !== "parent" && role !== "provider") return null;
  const parent = role === "parent";
  const to = parent ? "/parent" : "/provider/subscription";
  const search = parent ? ({ tab: "payments" } as const) : undefined;
  const renewal = renewsOn
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
        dateStyle: "long",
        timeZone: "America/Toronto",
      }).format(new Date(renewsOn))
    : null;
  if (paid) {
    return (
      <aside className="rounded-2xl bg-surface px-4 py-4 ring-1 ring-border" data-ke="plan-card">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t("navMyPlan")}</p>
        <p className="mt-1 font-display text-2xl">{planLabel || t("navMyPlan")}</p>
        {renewal ? <p className="mt-1 text-sm text-muted">{t("upgradeRenews").replace("{date}", renewal)}</p> : null}
        <Link
          to={to}
          search={search}
          data-ke="upgrade-cta"
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-surface px-4 text-sm font-semibold text-fg ring-1 ring-border"
        >
          {t("navMyPlan")}
        </Link>
      </aside>
    );
  }
  return (
    <aside className="rounded-2xl bg-primary/10 px-4 py-4 ring-1 ring-primary/30" data-ke="upgrade-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("navUpgrade")}</p>
      <p className="mt-1 font-display text-2xl text-fg">{parent ? t("upgradeTryPlus") : t("upgradeGetPro")}</p>
      <p className="mt-1 text-sm text-muted">{parent ? t("upgradePlusBody") : t("upgradeProBody")}</p>
      <Link
        to={to}
        search={search}
        data-ke="upgrade-cta"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
      >
        {parent ? t("upgradeSeePlus") : t("upgradeSeePro")}
      </Link>
    </aside>
  );
}

/** Sits beside a Pro benefit (featured city, listing boost) on a free centre. */
export function UpgradeToProLink({ className = "" }: { className?: string }) {
  const { t } = useCopy();
  return (
    <Link
      to="/provider/subscription"
      data-ke="upgrade-to-pro"
      className={`inline-flex min-h-11 items-center text-sm font-semibold text-primary ${className}`}
    >
      {t("upgradeToPro")}
    </Link>
  );
}
