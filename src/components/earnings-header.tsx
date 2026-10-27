import { Link } from "@tanstack/react-router";
import { ChevronLeft, Settings, X } from "lucide-react";
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
  const Icon = icon === "close" ? X : ChevronLeft;
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/menu"
        search={back}
        aria-label={t("back")}
        data-ke={icon === "close" ? "earnings-close" : "earnings-back"}
        className="ke-press grid size-11 shrink-0 place-items-center rounded-full text-fg touch-manipulation hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Icon className="size-6" aria-hidden />
      </Link>
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
