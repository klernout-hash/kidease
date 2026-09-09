import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { clearCompare, readCompareEntries } from "@/lib/compare";
import { compareSlugsHref } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { Button } from "@/components/ui/button";

export function CompareBar() {
  const { t } = useCopy();
  const [ids, setIds] = useState<string[]>([]);
  const [href, setHref] = useState("/compare");

  useEffect(() => {
    function sync() {
      const entries = readCompareEntries();
      setIds(entries.map((item) => item.id));
      setHref(compareSlugsHref(entries.map((item) => item.slug)));
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

  const ready = ids.length >= 2;

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 border-t border-border bg-surface/95 px-[clamp(1rem,4vw,2rem)] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md [[data-channel=website]_&]:bottom-0">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 overflow-x-auto">
        <p className="text-sm font-medium">
          {t("compare")} · {ids.length}/5{ready ? "" : " — pick one more"}
        </p>
        <div className="flex items-center gap-2">
          {ready ? (
            <Button asChild size="sm">
              <a href={href}>{t("compareNow")}</a>
            </Button>
          ) : (
            <Button size="sm" disabled>
              {t("compareNow")}
            </Button>
          )}
          <button type="button" className="grid size-11 place-items-center text-muted hover:text-fg" onClick={() => clearCompare()} aria-label={t("clearCompare")}>
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
