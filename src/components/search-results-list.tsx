import type { ReactNode } from "react";
import { DaycareCard } from "@/components/daycare-card";
import { numberSearchResults } from "@/lib/search-pins";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function SearchResultsList({
  items,
  activeSlug,
  onHover,
  onSelect,
  distance,
}: {
  items: Card[];
  activeSlug?: string | null;
  onHover?: (slug: string) => void;
  onSelect?: (slug: string) => void;
  distance?: ReactNode;
}) {
  const { t } = useCopy();
  const numbered = numberSearchResults(items);
  const heading =
    numbered.length === 1
      ? t("searchResultCountOne")
      : t("searchResultCount").replace("{n}", String(numbered.length));

  return (
    <div className="ke-search-results-list" data-ke="search-results-list">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="min-h-7 text-[1.1rem] font-semibold tracking-[-0.03em] md:min-h-8 md:text-[1.35rem]">
          {t("nearYou")}
          <span className="ml-2 text-sm font-medium text-muted">{heading}</span>
        </h2>
      </div>
      {distance ? (
        <div className="mb-3" data-ke="search-distance">
          {distance}
        </div>
      ) : null}
      <ol className="ke-search-result-ol m-0 flex list-none flex-col gap-3 p-0">
        {numbered.map(({ item, index }) => {
          const active = item.slug === activeSlug;
          return (
            <li key={item.id}>
              <article
                data-ke="search-result"
                data-slug={item.slug}
                data-result-index={index}
                data-active={active ? "true" : "false"}
                className={cn("ke-search-result", active && "is-active")}
                onMouseEnter={() => onHover?.(item.slug)}
                onFocus={() => onHover?.(item.slug)}
                onClick={() => onSelect?.(item.slug)}
              >
                <span
                  className="ke-search-result-n"
                  aria-label={t("searchResultPin").replace("{n}", String(index))}
                >
                  {index}
                </span>
                <div className="min-w-0 flex-1">
                  <DaycareCard item={item} eager={index <= 2} />
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
