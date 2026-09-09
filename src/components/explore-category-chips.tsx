import type { ComponentProps } from "react";
import {
  Baby,
  Backpack,
  BookOpen,
  Clock,
  Home,
  LayoutGrid,
  Shapes,
  Smile,
  type LucideIcon,
} from "lucide-react";
import { ChipButton } from "@/components/chip";
import {
  EXPLORE_CATEGORY_COPY,
  visibleExploreCategories,
  type ExploreCategory,
} from "@/lib/explore-categories";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const CAT_ICON: Record<ExploreCategory, LucideIcon> = {
  infant: Baby,
  toddler: Smile,
  preschool: Shapes,
  "school-age": Backpack,
  "before-after": Clock,
  home: Home,
  nursery: BookOpen,
};

export function ExploreCategoryChips({
  selected,
  counts,
  onSelect,
}: {
  selected?: ExploreCategory;
  counts: Record<ExploreCategory, number>;
  onSelect: (cat?: ExploreCategory) => void;
}) {
  const { t } = useCopy();
  const visible = visibleExploreCategories(counts, selected);

  return (
    <div
      className="ke-explore-cats mt-3"
      data-search-row="categories"
      role="group"
      aria-label={t("exploreCategories")}
    >
      <ExploreCatChip
        icon={LayoutGrid}
        label={t("catAll")}
        on={!selected}
        aria-pressed={!selected}
        data-explore-cat="all"
        onClick={() => onSelect(undefined)}
      />
      {visible.map((cat) => {
        const Icon = CAT_ICON[cat];
        return (
          <ExploreCatChip
            key={cat}
            icon={Icon}
            label={t(EXPLORE_CATEGORY_COPY[cat])}
            on={selected === cat}
            aria-pressed={selected === cat}
            data-explore-cat={cat}
            onClick={() => onSelect(selected === cat ? undefined : cat)}
          />
        );
      })}
    </div>
  );
}

function ExploreCatChip({
  icon: Icon,
  label,
  on,
  className,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
} & ComponentProps<typeof ChipButton>) {
  return (
    <ChipButton
      on={on}
      className={cn("ke-explore-cat", className)}
      {...props}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </ChipButton>
  );
}
