import { Link } from "@tanstack/react-router";
import { upgradeNavLabel, type ChromeRole } from "@/lib/role-access";

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
  if (role !== "parent" && role !== "provider") return null;
  const parent = role === "parent";
  const to = parent ? "/parent" : "/provider/subscription";
  const search = parent ? ({ tab: "payments" } as const) : undefined;
  const renewal = renewsOn
    ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "America/Toronto" }).format(new Date(renewsOn))
    : null;
  if (paid) {
    return (
      <aside className="rounded-2xl bg-surface px-4 py-4 ring-1 ring-border" data-ke="plan-card">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">My plan</p>
        <p className="mt-1 font-display text-2xl">{planLabel || "My plan"}</p>
        {renewal ? <p className="mt-1 text-sm text-muted">Renews on {renewal}</p> : null}
        <Link
          to={to}
          search={search}
          data-ke="upgrade-cta"
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-surface px-4 text-sm font-semibold text-fg ring-1 ring-border"
        >
          {upgradeNavLabel(true)}
        </Link>
      </aside>
    );
  }
  return (
    <aside className="rounded-2xl bg-primary/10 px-4 py-4 ring-1 ring-primary/30" data-ke="upgrade-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Upgrade</p>
      <p className="mt-1 font-display text-2xl text-fg">{parent ? "Try Parent Plus" : "Get more with Pro"}</p>
      <p className="mt-1 text-sm text-muted">
        {parent
          ? "Optional video tours and alerts. Search and messages stay free. Prices in CA$."
          : "Optional featured city, listing boost, and 90 days of stats. Your listing stays free. Prices in CA$."}
      </p>
      <Link
        to={to}
        search={search}
        data-ke="upgrade-cta"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
      >
        {parent ? "See Parent Plus" : "See Pro plans"}
      </Link>
    </aside>
  );
}

/** Sits beside a Pro benefit (featured city, listing boost) on a free centre. */
export function UpgradeToProLink({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/provider/subscription"
      data-ke="upgrade-to-pro"
      className={`inline-flex min-h-11 items-center text-sm font-semibold text-primary ${className}`}
    >
      Upgrade to Pro
    </Link>
  );
}
