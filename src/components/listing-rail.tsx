import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DaycareCard as Card } from "@/lib/types";
import { DaycareCard } from "@/components/daycare-card";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function ListingRail({
  title,
  items,
  limit = 12,
  seeAllHref,
  hideTitle = false,
  className,
}: {
  title: string;
  items: Card[];
  limit?: number;
  seeAllHref?: string;
  hideTitle?: boolean;
  className?: string;
}) {
  const { t } = useCopy();
  const scroller = useRef<HTMLDivElement>(null);
  const shown = items.slice(0, limit);
  if (!shown.length) return null;

  function go(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 208, behavior: "smooth" });
  }

  const showChevrons = shown.length > 3;

  return (
    <section className={cn("mt-8 first:mt-4 md:mt-10", className)}>
      {hideTitle && !seeAllHref && !showChevrons ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div className={cn("mb-3 flex items-center justify-between gap-3", !hideTitle && "md:mb-4")}>
          {hideTitle ? <h2 className="sr-only">{title}</h2> : (
            <h2 className="min-w-0 truncate text-[1.2rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
              {title}
            </h2>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {seeAllHref ? (
              <a
                href={seeAllHref}
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("seeAll")}
              </a>
            ) : null}
            {showChevrons ? (
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  aria-label={t("railPrev")}
                  onClick={() => go(-1)}
                  className="grid size-11 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={t("railNext")}
                  onClick={() => go(1)}
                  className="grid size-11 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <div ref={scroller} className="ke-rail">
        {shown.map((item, i) => (
          <div key={item.id} className="ke-rail-card">
            <DaycareCard item={item} compact eager={i < 2} />
          </div>
        ))}
      </div>
    </section>
  );
}
