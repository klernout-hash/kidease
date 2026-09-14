import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { Baby, Backpack, Shapes, Smile, type LucideIcon } from "lucide-react";
import { isRailAge, RAIL_AGES, type RailAge } from "@/lib/care-type";
import { EXPLORE_CATEGORY_COPY, type ExploreCategory } from "@/lib/explore-categories";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const CAT_ICON: Partial<Record<ExploreCategory, LucideIcon>> = {
  infant: Baby,
  toddler: Smile,
  preschool: Shapes,
  "school-age": Backpack,
};

export function ExploreCategoryChips({
  selected,
  searchFor,
  onSelect,
}: {
  selected?: readonly RailAge[];
  counts?: Record<ExploreCategory, number>;
  searchFor: (cat?: RailAge) => Record<string, unknown>;
  onSelect?: (cat?: RailAge) => void;
}) {
  const { t } = useCopy();
  const picked = (selected ?? []).filter(isRailAge);
  const allOn = picked.length === 0;

  return (
    <>
      {picked.length ? (
        <ExploreCatChip
          label={t("catAll")}
          on={allOn}
          aria-pressed={allOn}
          data-explore-cat="all"
          search={searchFor(undefined)}
          onClick={() => onSelect?.(undefined)}
        />
      ) : null}
      {RAIL_AGES.map((cat) => {
        const Icon = CAT_ICON[cat];
        const on = picked.includes(cat);
        return (
          <ExploreCatChip
            key={cat}
            icon={Icon}
            label={t(EXPLORE_CATEGORY_COPY[cat])}
            on={on}
            aria-pressed={on}
            data-explore-cat={cat}
            search={searchFor(cat)}
            onClick={() => onSelect?.(cat)}
          />
        );
      })}
    </>
  );
}

function ExploreCatChip({
  icon: Icon,
  label,
  on,
  className,
  search,
  ...props
}: {
  icon?: LucideIcon;
  label: string;
  on: boolean;
  search: Record<string, unknown>;
} & Omit<ComponentProps<typeof Link>, "to" | "search" | "className">) {
  return (
    <Link
      to="/search"
      search={search as never}
      className={cn("ke-chip ke-explore-cat", on && "ke-chip-on", className)}
      {...props}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span>{label}</span>
    </Link>
  );
}
