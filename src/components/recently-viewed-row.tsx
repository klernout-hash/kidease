import { Link } from "@tanstack/react-router";
import { BuildingPhoto } from "@/components/building-photo";
import { primaryListingPhoto } from "@/lib/listing-photo";
import { localePath } from "@/lib/locale-path";
import { isSafeSitemapSlug } from "@/lib/sitemap";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { displayCentreName } from "@/lib/utils";

/**
 * One short row of centres this browser has opened.
 * Renders nothing until there is history, so the home page does not reserve space.
 */
export function RecentlyViewedRow({ items }: { items: Card[] }) {
  const { t, locale } = useCopy();
  const rows = items.filter((item) => isSafeSitemapSlug(item.slug)).slice(0, 12);
  if (!rows.length) return null;

  return (
    <section className="mt-8" data-ke="recently-viewed" aria-label={t("recentlyViewed")}>
      <h2 className="text-base font-semibold tracking-[-0.03em]">{t("recentlyViewed")}</h2>
      <div className="ke-chip-carousel mt-2">
      <ul className="ke-chip-carousel-track list-none">
        {rows.map((item) => {
          const name = displayCentreName(locale === "fr" && item.nameFr ? item.nameFr : item.name);
          const photo = primaryListingPhoto((item.photos ?? []).filter((src) => src && !src.includes("-logo")));
          return (
            <li key={item.id} className="min-w-0 shrink-0">
              <Link
                to={localePath(`/daycare/${item.slug}`, locale)}
                data-ke="recent-chip"
                className="ke-chip h-auto min-h-[44px] w-[min(16rem,72vw)] max-w-[min(16rem,72vw)] justify-start gap-2 overflow-hidden whitespace-normal px-1.5 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <BuildingPhoto
                  src={photo}
                  alt=""
                  width={64}
                  height={64}
                  sizes="36px"
                  className="size-9 shrink-0 overflow-hidden rounded-md"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-4 text-fg">{name}</span>
                  <span className="block truncate text-[12px] font-normal leading-4 text-muted">{item.city}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      </div>
    </section>
  );
}
