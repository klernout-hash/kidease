import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/**
 * One labelled chip row that scrolls sideways instead of wrapping
 * into a dense grid. Arrows show only when the row overflows.
 */
export function ChipCarousel({
  children,
  label,
  className,
  "data-search-row": row,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  "data-search-row"?: string;
}) {
  const { t } = useCopy();
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflowing = max > 2;
    const left = el.scrollLeft;
    setOverflow(overflowing);
    setCanPrev(overflowing && left > 2);
    setCanNext(overflowing && left < max - 2);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const onScroll = () => sync();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    for (const child of el.children) ro.observe(child);

    sync();
    const frame = requestAnimationFrame(sync);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children, sync]);

  function go(dir: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    const step = Math.max(Math.round(el.clientWidth * 0.7), 140);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <div
      className={cn("flex min-w-0 max-w-full items-center gap-1", className)}
      data-chip-carousel=""
      data-search-row={row}
    >
      {overflow ? (
        <button
          type="button"
          aria-label={t("chipCarouselPrev")}
          disabled={!canPrev}
          onClick={() => go(-1)}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
      ) : null}
      <div
        ref={scroller}
        role="group"
        aria-label={label}
        className="ke-chip-carousel min-w-0 flex-1"
      >
        {children}
      </div>
      {overflow ? (
        <button
          type="button"
          aria-label={t("chipCarouselNext")}
          disabled={!canNext}
          onClick={() => go(1)}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
