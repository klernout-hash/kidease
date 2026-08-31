import type { DaycareCard as Card } from "@/lib/types";
import { DaycareCard } from "@/components/daycare-card";

export function ListingRail({
  title,
  items,
}: {
  title: string;
  items: Card[];
}) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em] md:text-2xl">{title}</h2>
      <div className="ke-rail mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="w-[42vw] max-w-[11.75rem] shrink-0 snap-start sm:w-[11.75rem] md:w-[13.25rem] md:max-w-none"
          >
            <DaycareCard item={item} cta="details" compact />
          </div>
        ))}
      </div>
    </section>
  );
}
