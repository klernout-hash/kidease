import { MENU_ROUTE } from "@/lib/menu-leaf";
import { HistoryBack } from "@/components/history-back";
import { useCopy } from "@/lib/use-copy";

/**
 * Top-left back for Menu-leaf pages (Privacy, Help, and the rest).
 * History returns to the screen that opened the leaf. A cold visit
 * replaces to the menu so the control still works.
 */
export function MenuLeafBack() {
  const { t } = useCopy();
  const label = t("navMenu");

  return (
    <HistoryBack
      fallbackHref={MENU_ROUTE}
      fallbackLabel={label}
      fallbackAria={t("backToMenu")}
      marker="menu-leaf-back"
      data-ke-menu-leaf-back=""
      className="relative z-10 text-primary"
    />
  );
}
