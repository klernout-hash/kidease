import type { ComponentProps } from "react";
import { Baby, Backpack, Shapes, Smile, type LucideIcon } from "lucide-react";
import { ChipButton } from "@/components/chip";
import { isRailAge } from "@/lib/care-type";
import {
  EXPLORE_CATEGORY_COPY,
  visibleExploreCategories,
  type ExploreCategory,
} from "@/lib/explore-categories";
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
  counts,
  onSelect,
}: {
  selected?: ExploreCategory;
  counts: Record<ExploreCategory, number>;
  onSelect: (cat?: ExploreCategory) => void;
}) {
  const { t } = useCopy();
  const visible = visibleExploreCategories(counts, selected).filter((cat) => isRailAge(cat));
  const ageOn = selected && isRailAge(selected) ? selected : undefined;

  return (
    <>
      {visible.map((cat) => {
        const Icon = CAT_ICON[cat];
        return (
          <ExploreCatChip
            key={cat}
            icon={Icon}
            label={t(EXPLORE_CATEGORY_COPY[cat])}
            on={ageOn === cat}
            aria-pressed={ageOn === cat}
            data-explore-cat={cat}
            onClick={() => onSelect(ageOn === cat ? undefined : cat)}
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
  ...props
}: {
  icon?: LucideIcon;
  label: string;
  on: boolean;
} & ComponentProps<typeof ChipButton>) {
  return (
    <ChipButton on={on} className={cn("ke-explore-cat", className)} {...props}>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span>{label}</span>
    </ChipButton>
  );
}
