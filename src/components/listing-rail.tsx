import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DaycareCard as Card } from "@/lib/types";
import { DaycareCard } from "@/components/daycare-card";

export function ListingRail({
  title,
  items,
  limit = 12,
}: {
  title: string;
  items: Card[];
  limit?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const shown = items.slice(0, limit);
  if (!shown.length) return null;

  function go(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  return (
    <section className="mt-8 first:mt-4 md:mt-10">
      <div className="mb-3 flex items-center justify-between gap-3 md:mb-4">
        <h2 className="min-w-0 truncate text-[1.2rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
          {title}
        </h2>
        {shown.length > 3 ? (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(-1)}
              className="grid size-8 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(1)}
              className="grid size-8 place-items-center rounded-full bg-surface text-fg ring-1 ring-border hover:bg-surface-2"
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        ) : null}
      </div>
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
