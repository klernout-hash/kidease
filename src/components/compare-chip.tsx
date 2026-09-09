import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { hasCompare, toggleCompareItem } from "@/lib/compare";
import { compareSlugsHref } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function CompareChip({
  id,
  slug,
  className,
}: {
  id: string;
  slug: string;
  className?: string;
}) {
  const { t } = useCopy();
  const [on, setOn] = useState(false);

  useEffect(() => {
    function sync() {
      setOn(hasCompare(id, slug));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("kidease-compare", sync);
      window.removeEventListener("storage", sync);
    };
  }, [id, slug]);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-2.5 text-[11px] font-semibold ring-1",
        on ? "bg-fg text-bg ring-fg" : "bg-white/92 text-fg ring-black/10",
        className,
      )}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCompareItem({ id, slug });
      }}
    >
      {on ? t("compareAdded") : t("compareAdd")}
    </button>
  );
}

export function CompareDeepLink({ slugs, className }: { slugs: string[]; className?: string }) {
  const { t } = useCopy();
  const href = compareSlugsHref(slugs);
  return (
    <Link to={href} className={className}>
      {t("compareNow")}
    </Link>
  );
}
