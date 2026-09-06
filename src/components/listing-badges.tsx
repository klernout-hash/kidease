import { PriorityPill } from "@/components/priority-pill";
import { TrustSignals } from "@/components/trust-badge";
import { vacancyLine } from "@/components/vacancy-freshness";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

export function ListingBadges({
  item,
  compact = false,
}: {
  item: Daycare;
  compact?: boolean;
}) {
  const { t, locale } = useCopy();
  const feeBadge = feeProgramBadgeKey(item.province);
  const spots = (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown);
  const freshness = vacancyLine(item, t, locale);
  const pill = compact
    ? "rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium"
    : "rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.priority ? <PriorityPill /> : null}
      <TrustSignals item={item} surface="parent" compact={compact} />
      {feeBadge ? <span className={cn(pill, "bg-primary text-primary-fg")}>{t(feeBadge)}</span> : null}
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
      {freshness.kind !== "unknown" && freshness.text ? (
        <span className={cn(pill, "text-muted")}>{freshness.text}</span>
      ) : null}
    </div>
  );
}
