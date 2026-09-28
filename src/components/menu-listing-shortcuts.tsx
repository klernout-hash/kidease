import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getProvider } from "@/lib/server/family";
import { storedCentreName } from "@/lib/utils";

type ListingChip = {
  id: string;
  name: string;
  nameFr?: string | null;
  slug: string;
  city: string;
};

/**
 * One compact shortcut tile per centre the signed-in daycare owns or manages.
 * Uses getProvider listings — same source as the daycare desk.
 */
export function MenuListingShortcuts() {
  const [listings, setListings] = useState<ListingChip[] | null>(null);

  useEffect(() => {
    let live = true;
    void getProvider()
      .then((res) => {
        if (!live) return;
        const next = (res.listings || []).map((d) => ({
          id: d.id,
          name: d.name,
          nameFr: d.nameFr,
          slug: d.slug,
          city: d.city,
        }));
        setListings(next);
      })
      .catch(() => {
        if (live) setListings([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!listings?.length) return null;

  return (
    <section className="mt-4" data-ke="menu-listing-shortcuts">
      <h2 className="px-1 text-[13px] font-semibold text-muted">Your daycares</h2>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {listings.map((d) => {
          const label = storedCentreName(d.name, d.nameFr) || d.name;
          return (
            <Link
              key={d.id}
              to="/provider"
              search={{ desk: "listings" }}
              hash={`centre-${d.id}`}
              className="flex w-[5.2rem] shrink-0 flex-col items-center gap-1 rounded-2xl bg-surface px-1.5 py-2.5 text-center ring-1 ring-border"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                {label.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-fg">{label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
