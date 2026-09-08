import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { memo } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { PhotoCarousel } from "@/components/photo-carousel";
import { SaveListingButton } from "@/components/save-listing-button";
import { ShareListingButton } from "@/components/share-button";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, money } from "@/lib/utils";
import { distanceKm as kmBetween } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { displayDistance } from "@/lib/units";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { listingPill } from "@/lib/listing-card";
import { classifyFacilityType, type FacilityType } from "@/lib/facility-type";
import { publicLicenseBadge } from "@/lib/license-verify";
import { isCatalogueMatchedBadge, trustBadgesFor } from "@/lib/trust";
import type { CopyKey } from "@/lib/copy";
import { photoLine, vacancyLine } from "@/components/vacancy-freshness";
import { parentIncompleteLabel } from "@/components/listing-completeness";
import { TrustBadge, TrustSignals } from "@/components/trust-badge";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";

export const DaycareCard = memo(function DaycareCard({
  item,
  showDistance = true,
  compact = false,
  eager = false,
}: {
  item: Card;
  showDistance?: boolean;
  cta?: "book" | "details";
  compact?: boolean;
  eager?: boolean;
}) {
  const { t, locale } = useCopy();
  const name = displayCentreName(locale === "fr" ? item.nameFr : item.name);
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown);
  const open = item.spotsTotal > 0;
  const feeOk = (live || Boolean(item.feeConfirmed)) && item.fromPrice > 0;
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const distanceKm = kmBetween(origin, { lat: item.lat, lng: item.lng });
  const feeBadge = feeProgramBadgeKey(item.province);
  const away = located ? `${displayDistance(distanceKm, distanceUnit)} ${distanceUnit === "mi" ? t("miAway") : t("kmAway")}` : "";
  const photos = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));

  const license = publicLicenseBadge(item);
  const cardTrust = trustBadgesFor(item, "card");
  const pillKey = listingPill(item)?.labelKey;
  const pill = pillKey ? t(pillKey as CopyKey) : "";
  const showLicensedChip = Boolean(license && pillKey !== license.labelKey);
  const ages =
    item.ageMaxMonths > item.ageMinMonths ? `${item.ageMinMonths}–${item.ageMaxMonths} months` : "";
  const hours = (item.hours || "").replace(/Monday to Friday/i, "Mon–Fri").trim();
  const facility = classifyFacilityType(item);
  const FACILITY_CARD: Record<FacilityType, CopyKey> = {
    centre: "facilityTypeCentre",
    nursery: "facilityTypeNursery",
    home: "facilityTypeHome",
  };
  const typeLabel = t(FACILITY_CARD[facility.type]);
  const line3 = [typeLabel, ages, hours].filter(Boolean).join(" · ");
  const freshness = vacancyLine(item, t, locale);
  const photosAge = photoLine(item, t, locale);
  const incompleteLabel = parentIncompleteLabel(item, t);
  const spotsKnown = known ? (open ? `${item.spotsTotal} ${t("spots")}` : t("waitlist")) : "";
  const freshnessText = freshness.kind === "unknown" ? "" : freshness.text;
  const photoText = photosAge.kind === "unknown" ? "" : photosAge.text;
  const priceAmount = feeBadge === "badgeTen" ? "$10" : feeOk ? money(item.fromPrice, locale) : "";
  const priceUnit = feeBadge === "badgeTen" ? " / day" : feeOk ? t("month") : "";

  return (
    <article data-slug={item.slug} className="ke-tile group relative w-full">
      <Link to="/daycare/$slug" params={{ slug: item.slug }} className="block text-inherit no-underline">
        <div className="relative">
          <PhotoCarousel
            photos={photos}
            eager={eager}
            rounded="rounded-[14px]"
            className={cn("bg-[#EBEBEB]", compact ? "aspect-[20/19]" : "aspect-[4/3]")}
          />
          <div className="pointer-events-none absolute left-2 top-2 z-[2] flex flex-col items-start gap-1">
            {pill ? (
              <span
                className="inline-flex rounded-full bg-white/92 px-2 py-0.5 text-[10px] font-semibold leading-none text-[#222] shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-[8px]"
                title={license && pillKey === license.labelKey ? t(license.tipKey as CopyKey) : undefined}
              >
                {item.priority ? `✦ ${pill}` : pill}
              </span>
            ) : null}
            {showLicensedChip && license && !isCatalogueMatchedBadge(license) ? (
              <span className="pointer-events-auto">
                <TrustBadge badge={license} compact />
              </span>
            ) : null}
            <span className="pointer-events-auto">
              <GuestFavoriteBadge item={item} compact surface="photo" />
            </span>
          </div>
          {photos.length === 0 || photos.every((p) => p.includes("placeholder")) ? (
            <span className="pointer-events-none absolute bottom-2 left-2 z-[2] rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
              {live ? t("storefrontPhoto") : t("notOnKidEase")}
            </span>
          ) : null}
        </div>

        <div className="mt-2 space-y-px text-fg">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[13px] font-semibold leading-[1.25] tracking-[-0.2px] text-fg dark:text-white">
              {name}
            </h3>
            {item.parentReviewCount && item.parentReviewCount > 0 && (item.parentRatingX10 ?? 0) > 0 ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[12px] leading-none tabular-nums" title={t("parentReviews")}>
                <Star className="size-2.5 fill-fg text-fg dark:fill-white dark:text-white" strokeWidth={0} />
                <span className="font-semibold">{((item.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
                <span className="font-normal text-muted">({item.parentReviewCount})</span>
              </span>
            ) : item.ratingX10 > 0 && item.reviewCount > 0 ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[12px] leading-none tabular-nums">
                <Star className="size-2.5 fill-fg text-fg dark:fill-white dark:text-white" strokeWidth={0} />
                <span className="font-semibold">{(item.ratingX10 / 10).toFixed(2)}</span>
                <span className="font-normal text-muted">({item.reviewCount})</span>
              </span>
            ) : null}
          </div>
          {cardTrust.length ? (
            <div
              className="pt-0.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <TrustSignals item={item} surface="card" compact />
            </div>
          ) : null}
          {showDistance ? (
            <p className="truncate text-[13px] font-normal leading-4 text-muted">
              {item.city}
              {away ? ` · ${away}` : ""}
            </p>
          ) : (
            <p className="truncate text-[13px] font-normal leading-4 text-muted">{item.city}</p>
          )}
          {line3 ? <p className="truncate text-[13px] font-normal leading-4 text-muted">{line3}</p> : null}
          {incompleteLabel ? (
            <p className="truncate text-[12px] font-normal leading-4 text-muted">{incompleteLabel}</p>
          ) : null}
          {spotsKnown || freshnessText || photoText || typeof item.matchScore === "number" || (item.urgencyScore ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {spotsKnown ? <span className="ke-honesty">{spotsKnown}</span> : null}
              {freshnessText ? <span className="ke-honesty">{freshnessText}</span> : null}
              {photoText ? <span className="ke-honesty">{photoText}</span> : null}
              <MatchCue score={item.matchScore} compact />
              <UrgencyCue score={item.urgencyScore} compact />
            </div>
          ) : null}
          {priceAmount ? (
            <p className="pt-0.5 text-[13px] leading-4 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-muted">{priceUnit}</span>
            </p>
          ) : null}
        </div>
      </Link>
      <ShareListingButton
        slug={item.slug}
        name={name}
        appearance="photo"
        className="pointer-events-auto absolute right-12 top-2 z-20"
      />
      <SaveListingButton daycareId={item.id} />
    </article>
  );
});
