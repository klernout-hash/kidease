import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { MENU_ROUTE } from "@/lib/menu-leaf";
import { useCopy } from "@/lib/use-copy";

/**
 * Top-left chevron for Menu-leaf pages.
 * Prefer in-app history (Menu → leaf). Cold visits follow the href to `/menu`
 * so the control still works if hydration lags.
 */
export function MenuLeafBack() {
  const { t } = useCopy();
  const router = useRouter();
  const label = t("backToMenu");

  return (
    <Link
      to={MENU_ROUTE}
      data-ke-menu-leaf-back=""
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (!router.history.canGoBack()) return;
        e.preventDefault();
        router.history.back();
      }}
      className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ChevronLeft className="size-6" strokeWidth={2.2} aria-hidden="true" />
    </Link>
  );
}
