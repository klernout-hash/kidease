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
  eagerThumbs = true,
  className,
  railId,
  empty,
  persist = false,
}: {
  title: string;
  items: Card[];
  limit?: number;
  seeAllHref?: string;
  hideTitle?: boolean;
  /** Off on marketing home so hidden app rails do not preload against the LCP hero. */
  eagerThumbs?: boolean;
  className?: string;
  railId?: string;
  empty?: { title?: string; body: string };
  /** Keep the row even when sparse so a selected Explore filter never disappears. */
  persist?: boolean;
}) {
  const { t } = useCopy();
  const scroller = useRef<HTMLDivElement>(null);
  const shown = items.slice(0, limit);
  if (!shown.length && !empty && !persist) return null;

  function go(dir: -1 | 1) {
    const port = scroller.current;
    const step = port ? Math.max(Math.round(port.clientWidth * 0.72), 196) : 208;
    port?.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  const showChevrons = shown.length > 1;

  if (!shown.length && (empty || persist)) {
    return (
      <section
        className={cn("ke-listing-rail ke-listing-rail--empty mt-6 first:mt-4 md:mt-8", className)}
        data-ke="explore-rail-empty"
        data-rail={railId}
      >
        <div className="ke-listing-rail-head mb-2 flex items-center justify-between gap-3">
          <h2 className="ke-listing-rail-title min-h-7 min-w-0 text-[1.1rem] font-semibold tracking-[-0.03em] md:min-h-8 md:text-[1.35rem]">
            {empty?.title || title}
          </h2>
        </div>
        <p className="mt-1 max-w-xl text-sm text-muted">{empty?.body}</p>
      </section>
    );
  }

  return (
    <section className={cn("ke-listing-rail mt-6 first:mt-4 md:mt-8", className)} data-rail={railId}>
      {hideTitle && !seeAllHref && !showChevrons ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div className={cn("ke-listing-rail-head mb-2 flex items-center justify-between gap-3", !hideTitle && "md:mb-3")}>
          {hideTitle ? <h2 className="sr-only">{title}</h2> : (
            <h2 className="ke-listing-rail-title min-h-7 min-w-0 text-[1.1rem] font-semibold tracking-[-0.03em] md:min-h-8 md:text-[1.35rem]">
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
              <div className="ke-listing-rail-arrows hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  aria-label={t("railPrev")}
                  onClick={() => go(-1)}
                  className="ke-listing-rail-arrow grid size-11 place-items-center rounded-full bg-surface text-fg ring-1 ring-border"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={t("railNext")}
                  onClick={() => go(1)}
                  className="ke-listing-rail-arrow grid size-11 place-items-center rounded-full bg-surface text-fg ring-1 ring-border"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <div className="ke-listing-rail-port">
        <div ref={scroller} className="ke-rail">
          {shown.map((item, i) => (
            <div key={item.id} className="ke-rail-card">
              <DaycareCard item={item} compact eager={eagerThumbs && i < 2} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
