import type { ComponentProps } from "react";
import { Baby, Backpack, Shapes, Smile, type LucideIcon } from "lucide-react";
import { ChipButton } from "@/components/chip";
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
  onSelect,
}: {
  selected?: readonly RailAge[];
  counts?: Record<ExploreCategory, number>;
  onSelect: (cat?: RailAge) => void;
}) {
  const { t } = useCopy();
  const picked = (selected ?? []).filter(isRailAge);
  const allOn = picked.length === 0;

  return (
    <>
      <ExploreCatChip
        label={t("catAll")}
        on={allOn}
        aria-pressed={allOn}
        data-explore-cat="all"
        onClick={() => onSelect(undefined)}
      />
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
            onClick={() => onSelect(cat)}
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
