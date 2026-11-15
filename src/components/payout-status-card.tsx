import { Link, useRouterState } from "@tanstack/react-router";
import { menuDeskPath } from "@/lib/desk-nav";
import { useCopy } from "@/lib/use-copy";

/** Connected, not set up yet, or still unknown. The words come from the stored Stripe row. */
export function PayoutStatusCard({ status }: { status: "on" | "off" | "unknown" }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const body = status === "on" ? t("earningsPayoutsOn") : status === "off" ? t("earningsPayoutsOff") : t("earningsPayoutsLater");
  return (
    <section className="rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="payout-status" data-status={status}>
      <h3 className="font-display text-lg">{t("connectPayouts")}</h3>
      <p className="mt-2 text-sm leading-6">{body}</p>
      {status === "on" ? null : (
        <Link
          to={menuDeskPath(pathname)}
          search={{ screen: "earnings", view: "payouts" }}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("connectOnboarding")}
        </Link>
      )}
    </section>
  );
}
