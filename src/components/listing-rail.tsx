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
      <div className="ke-rail mt-4">
        {items.slice(0, 8).map((item, i) => (
          <div key={item.id} className="ke-rail-card">
            <DaycareCard item={item} eager={i < 2} />
          </div>
        ))}
      </div>
    </section>
  );
}
