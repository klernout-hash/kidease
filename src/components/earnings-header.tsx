import { Link } from "@tanstack/react-router";
import { Settings, X } from "lucide-react";
import { HistoryBack } from "@/components/history-back";
import { historyHref } from "@/lib/screen-history";
import { useCopy } from "@/lib/use-copy";

type EarningsSearch = {
  screen: "earnings";
  view?: "payouts" | "details" | "upcoming" | "paid" | "statement";
  period?: string;
  bill?: string;
};

export function EarningsHeader({
  title,
  back,
  icon = "back",
  gear = false,
}: {
  title: string;
  back: EarningsSearch | { screen?: undefined };
  icon?: "back" | "close";
  gear?: boolean;
}) {
  const { t } = useCopy();
  const fallbackHref = historyHref("/menu", back.screen ? back : {});
  return (
    <div className="flex items-center gap-2">
      {icon === "close" ? (
        <Link
          to="/menu"
          search={back}
          aria-label={t("close")}
          data-ke="earnings-close"
          className="ke-press grid size-11 shrink-0 place-items-center rounded-full text-fg touch-manipulation hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="size-6" aria-hidden />
        </Link>
      ) : (
        <HistoryBack
          fallbackHref={fallbackHref}
          fallbackLabel={back.screen ? t("earningsTitle") : t("navMenu")}
          fallbackAria={t("back")}
          marker="earnings-back"
        />
      )}
      <h1 className="min-w-0 flex-1 truncate text-center font-display text-xl">{title}</h1>
      {gear ? (
        <Link
          to="/menu"
          search={{ screen: "earnings", view: "payouts" }}
          aria-label={t("earningsPayoutSettings")}
          data-ke="earnings-gear"
          className="ke-press grid size-11 shrink-0 place-items-center rounded-full text-fg touch-manipulation hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Settings className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className="size-11 shrink-0" aria-hidden />
      )}
    </div>
  );
}
