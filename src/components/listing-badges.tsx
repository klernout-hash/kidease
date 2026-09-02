import { PriorityPill } from "@/components/priority-pill";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

export function ListingBadges({
  item,
  compact = false,
}: {
  item: Pick<
    Daycare,
    | "live"
    | "province"
    | "amenities"
    | "availabilityKnown"
    | "spotsInfant"
    | "spotsToddler"
    | "spotsPreschool"
    | "waitlist"
    | "priority"
  >;
  compact?: boolean;
}) {
  const { t } = useCopy();
  const feeBadge = feeProgramBadgeKey(item.province);
  const spots = (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown || live);
  const pill = compact
    ? "rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium"
    : "rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium";

  return (
    <div className="flex flex-wrap gap-1.5">
      {item.priority ? <PriorityPill /> : null}
      <span className={pill}>{t("licensed")}</span>
      {feeBadge ? <span className={cn(pill, "bg-primary text-primary-fg")}>{t(feeBadge)}</span> : null}
      <span className={pill}>{t("badgeSubsidy")}</span>
      {live ? (
        <span className={cn(pill, "bg-ok text-primary-fg")}>{t("live")}</span>
      ) : null}
      {known ? (
        <span className={cn(pill, spots > 0 ? "" : "bg-fg/80 text-surface")}>
          {spots > 0 ? `${spots} ${t("spots")}` : t("waitlist")}
        </span>
      ) : (
        <span className={cn(pill, "text-muted")}>{t("availUnknown")}</span>
      )}
    </div>
  );
}
