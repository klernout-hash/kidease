import { Link } from "@tanstack/react-router";
import { upgradeNavLabel, type ChromeRole } from "@/lib/role-access";

/** One small optional card. Free KidEase stays usable without it. */
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
      <aside className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="plan-card">
        <p className="text-sm font-medium text-fg">{planLabel || "My plan"}</p>
        {renewal ? <p className="mt-1 text-sm text-muted">Renews on {renewal}</p> : null}
        <Link to={to} search={search} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {upgradeNavLabel(true)}
        </Link>
      </aside>
    );
  }
  return (
    <aside className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="upgrade-card">
      <p className="text-sm font-medium text-fg">{parent ? "Try Parent Plus" : "Get more with Pro"}</p>
      <p className="mt-1 text-sm text-muted">
        {parent
          ? "Optional alerts and extras. KidEase stays free. Prices in CA$."
          : "Optional Pro, Network, and add-ons. Your listing stays free. Prices in CA$."}
      </p>
      <Link to={to} search={search} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {upgradeNavLabel(false)}
      </Link>
    </aside>
  );
}
