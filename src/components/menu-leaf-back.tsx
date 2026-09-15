import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { canNavigateBackInApp, MENU_ROUTE } from "@/lib/menu-leaf";
import { useCopy } from "@/lib/use-copy";

/**
 * Top-left chevron for Menu-leaf pages. Prefers in-app history (Menu → leaf)
 * and falls back to `/menu` so a cold visit still has a way back.
 */
export function MenuLeafBack() {
  const { t } = useCopy();
  const router = useRouter();
  const label = t("backToMenu");

  function goBack() {
    if (typeof window !== "undefined" && canNavigateBackInApp(window)) {
      router.history.back();
      return;
    }
    void router.navigate({ to: MENU_ROUTE });
  }

  return (
    <button
      type="button"
      data-ke-menu-leaf-back=""
      aria-label={label}
      title={label}
      onClick={goBack}
      className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ChevronLeft className="size-6" strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
