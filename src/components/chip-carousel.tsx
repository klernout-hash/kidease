import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const SCROLL_SCRIPT = `window.__keChipCarousel||(window.__keChipCarousel=1,document.addEventListener("click",function(e){var b=e.target.closest("[data-chip-scroll]");if(!b)return;var p=b.closest("[data-chip-carousel]")&&b.closest("[data-chip-carousel]").querySelector(".ke-chip-carousel");if(!p)return;var d=Number(b.getAttribute("data-chip-scroll"))||1;p.scrollBy({left:d*Math.max(p.clientWidth*0.7,140),behavior:"smooth"});}));`;

/**
 * One labelled chip row that scrolls sideways instead of wrapping
 * into a dense grid. Arrows show only when the row overflows so a
 * parent bar can keep Filters / Map sticky on the right.
 */
export function ChipCarousel({
  children,
  label,
  className,
  compact = false,
  "data-search-row": row,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  compact?: boolean;
  "data-search-row"?: string;
}) {
  const { t } = useCopy();
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const sync = useCallback(() => {
    const port = scroller.current;
    const inner = track.current;
    if (!port || !inner) return;
    const visible = port.clientWidth;
    const content = inner.scrollWidth;
    const overflowing = content > visible + 2;
    const left = port.scrollLeft;
    const max = content - visible;
    setOverflow(overflowing);
    setCanPrev(overflowing && left > 2);
    setCanNext(overflowing && left < max - 2);
  }, []);

  useLayoutEffect(() => {
    const port = scroller.current;
    const inner = track.current;
    const outer = wrap.current;
    if (!port || !inner) return;

    const onScroll = () => sync();
    port.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const ro = new ResizeObserver(() => sync());
    ro.observe(port);
    ro.observe(inner);
    if (outer) ro.observe(outer);

    sync();
    const later = window.setTimeout(sync, 80);
    const fonts = document.fonts?.ready.then(sync);
    return () => {
      port.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      window.clearTimeout(later);
      void fonts;
    };
  }, [children, sync]);

  function go(dir: -1 | 1) {
    const port = scroller.current;
    if (!port) return;
    const step = Math.max(Math.round(port.clientWidth * 0.7), 140);
    port.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <div
      ref={wrap}
      className={cn("relative w-full min-w-0 max-w-full", className)}
      data-chip-carousel=""
      data-chip-compact={compact ? "1" : "0"}
      data-chip-overflow={overflow ? "1" : "0"}
      data-search-row={row}
    >
      <script dangerouslySetInnerHTML={{ __html: SCROLL_SCRIPT }} />
      <button
        type="button"
        aria-label={t("chipCarouselPrev")}
        data-chip-scroll="-1"
        disabled={overflow ? !canPrev : undefined}
        onClick={() => go(-1)}
        className={cn(
          "absolute left-0 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface text-fg shadow-card ring-1 ring-border hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30",
          overflow ? (!canPrev ? "opacity-30" : "") : "hidden",
        )}
      >
        <ChevronLeft className="size-4" strokeWidth={2} />
      </button>
      <div
        ref={scroller}
        role="group"
        aria-label={label}
        className={cn(
          "ke-chip-carousel w-full min-w-0",
          overflow ? (compact ? "px-10" : "px-12") : "px-0",
        )}
      >
        <div ref={track} className="ke-chip-carousel-track">
          {children}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("chipCarouselNext")}
        data-chip-scroll="1"
        disabled={overflow ? !canNext : undefined}
        onClick={() => go(1)}
        className={cn(
          "absolute right-0 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface text-fg shadow-card ring-1 ring-border hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30",
          overflow ? (!canNext ? "opacity-30" : "") : "hidden",
        )}
      >
        <ChevronRight className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
