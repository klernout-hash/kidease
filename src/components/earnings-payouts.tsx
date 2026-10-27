import { EarningsHeader } from "@/components/earnings-header";
import { EmptyState } from "@/components/empty-state";
import { KidBlocks } from "@/components/kid-art";
import type { EarningsResult } from "@/lib/earnings-desk";
import { useCopy } from "@/lib/use-copy";

export function EarningsPayoutsScreen({ desk }: { desk: EarningsResult | null }) {
  const { t } = useCopy();
  const body =
    desk && desk.ok
      ? desk.payouts === "on"
        ? t("earningsPayoutsOn")
        : desk.payouts === "off"
          ? t("earningsPayoutsOff")
          : t("earningsPayoutsLater")
      : null;
  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="earnings-payouts">
      <EarningsHeader title={t("earningsPayoutSettings")} back={{ screen: "earnings" }} />
      {desk && !desk.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}
      {body ? (
        <div className="mt-6 rounded-[1.25rem] bg-surface p-5 ring-1 ring-border">
          <KidBlocks className="h-16 w-24 text-primary" />
          <p className="mt-4 text-base leading-6">{body}</p>
        </div>
      ) : null}
    </main>
  );
}
