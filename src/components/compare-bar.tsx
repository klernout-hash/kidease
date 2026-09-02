import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { clearCompare, readCompare } from "@/lib/compare";
import { useCopy } from "@/lib/use-copy";
import { Button } from "@/components/ui/button";

export function CompareBar() {
  const { t } = useCopy();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    function sync() {
      setIds(readCompare());
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("kidease-compare", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ids.length) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 border-t border-border bg-surface/95 px-[clamp(1rem,4vw,2rem)] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md [[data-channel=website]_&]:bottom-0">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 overflow-x-auto">
        <p className="text-sm font-medium">
          {t("compare")} · {ids.length}/3
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link to="/compare">{t("compareNow")}</Link>
          </Button>
          <button type="button" className="grid size-9 place-items-center text-muted hover:text-fg" onClick={() => clearCompare()} aria-label={t("clearCompare")}>
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
