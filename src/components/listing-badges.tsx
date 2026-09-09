import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";
import { PriorityPill } from "@/components/priority-pill";
import { TrustSignals } from "@/components/trust-badge";
import { photoLine, vacancyLine } from "@/components/vacancy-freshness";
import { classifyFacilityType, type FacilityType } from "@/lib/facility-type";
import { canShowMatchScore, confirmedFeeProgramBadge, honestVacancy } from "@/lib/now-loops";
import type { CopyKey } from "@/lib/copy";
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
  const feeBadge = confirmedFeeProgramBadge(item);
  const vacancy = honestVacancy(item);
  const live = Boolean(item.live);
  const freshness = vacancyLine(item, t, locale);
  const photosAge = photoLine(item, t, locale);
  const pill = compact
    ? "rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium"
    : "rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium";
  const facility = classifyFacilityType(item);
  const FACILITY_BADGE: Record<FacilityType, CopyKey> = {
    centre: "facilityTypeCentre",
    nursery: "facilityTypeNursery",
    home: "facilityTypeHome",
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn(pill, "text-muted")} data-facility-type={facility.type}>
        {t(FACILITY_BADGE[facility.type])}
      </span>
      {item.priority ? <PriorityPill /> : null}
      <GuestFavoriteBadge item={item} compact={compact} />
      <TrustSignals item={item} surface="parent" compact={compact} />
      {feeBadge ? <span className={cn(pill, "bg-primary text-primary-fg")}>{t(feeBadge)}</span> : null}
      {live ? (
        <span className={cn(pill, "bg-ok text-primary-fg")}>{t("live")}</span>
      ) : null}
      <span className={cn(pill, vacancy.kind === "open" ? "" : "text-muted", vacancy.kind === "waitlist" && "bg-fg/80 text-surface")}>
        {vacancy.kind === "open" ? `${vacancy.spots} ${t("spots")}` : t(vacancy.labelKey)}
      </span>
      {(vacancy.kind === "open" || vacancy.kind === "waitlist") && freshness.kind !== "unknown" && freshness.text ? (
        <span className={cn(pill, "text-muted")}>{freshness.text}</span>
      ) : null}
      {photosAge.kind !== "unknown" && photosAge.text ? (
        <span className={cn(pill, "text-muted")}>{photosAge.text}</span>
      ) : null}
      <MatchCue score={canShowMatchScore(item) ? item.matchScore : undefined} compact={compact} />
      <UrgencyCue score={item.urgencyScore} compact={compact} />
    </div>
  );
}
