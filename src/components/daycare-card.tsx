import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { memo } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { PhotoCarousel } from "@/components/photo-carousel";
import { SaveListingButton } from "@/components/save-listing-button";
import { ShareListingButton } from "@/components/share-button";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, displayListingText, money } from "@/lib/utils";
import { distanceKm as kmBetween } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { displayDistance } from "@/lib/units";
import { listingAgeRangeText } from "@/lib/listing-ages";
import { classifyFacilityType, facilityTypeSeoKind } from "@/lib/facility-type";
import { publicLicenseBadge } from "@/lib/license-verify";
import { isCatalogueMatchedBadge, trustBadgesFor, type TrustBadge as TrustBadgeModel } from "@/lib/trust";
import { publicApprovalEligible } from "@/lib/approve-live";
import {
  cardFeePillLabelKey,
  cardPhotoLicenseWarning,
  showCardLivePill,
} from "@/lib/card-photo-pills";
import { photoLine, vacancyLine } from "@/components/vacancy-freshness";
import { parentIncompleteLabel } from "@/components/listing-completeness";
import { TrustBadge, TrustSignals } from "@/components/trust-badge";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";
import { CompareChip } from "@/components/compare-chip";
import {
  canShowMatchScore,
  confirmedFeeProgramBadge,
  honestVacancy,
  liveLookingGaps,
} from "@/lib/now-loops";
import { listingAgeChips, parentAgeLabel } from "@/lib/parent-listing";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { MIN_REVIEW_COUNT } from "@/lib/quality";

const LIVE_PILL =
  "inline-flex items-center rounded-full bg-[#22C55E] font-bold leading-none text-[#052e16] shadow-[0_1px_3px_rgba(0,0,0,0.28)]";
const FEE_PILL =
  "inline-flex items-center rounded-full bg-[#1D4ED8] font-bold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.28)]";

function CardPhotoBadges({
  item,
  compact,
  hollowPhoto,
  live,
  showLivePill,
  feeLabel,
  licenseWarning,
  clearShare = false,
}: {
  item: Card;
  compact: boolean;
  hollowPhoto: boolean;
  live: boolean;
  showLivePill: boolean;
  feeLabel: string;
  licenseWarning: TrustBadgeModel | null;
  /** Rail cards also place a share control beside the heart. */
  clearShare?: boolean;
}) {
  const { t } = useCopy();
  const pill = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[12px]";
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[2] flex flex-col items-start",
        clearShare ? "max-w-[calc(100%-7.5rem)]" : "max-w-[calc(100%-4.25rem)]",
        compact ? "left-2 top-2 gap-1" : "left-3 top-3 gap-1.5",
      )}
    >
      {showLivePill || feeLabel ? (
        <div className="flex flex-wrap items-center gap-1" data-ke="card-photo-pills">
          {showLivePill ? (
            <span data-ke="card-live-pill" className={cn(LIVE_PILL, pill)}>
              {t("live")}
            </span>
          ) : null}
          {feeLabel ? (
            <span data-ke="card-fee-pill" className={cn(FEE_PILL, pill)}>
              {feeLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {hollowPhoto ? (
        <span
          className={cn(
            "inline-flex rounded-full bg-black/55 font-medium text-white",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
          )}
        >
          {live ? t("photoPending") : t("notOnKidEase")}
        </span>
      ) : null}
      {!compact && !hollowPhoto && licenseWarning ? (
        <span className="pointer-events-auto">
          <TrustBadge badge={licenseWarning} compact />
        </span>
      ) : null}
      {!compact && !hollowPhoto ? (
        <span className="pointer-events-auto">
          <GuestFavoriteBadge item={item} compact surface="photo" />
        </span>
      ) : null}
    </div>
  );
}

export const DaycareCard = memo(function DaycareCard({
  item,
  showDistance = true,
  compact = false,
  eager = false,
  presentation = "rail",
}: {
  item: Card;
  showDistance?: boolean;
  cta?: "book" | "details";
  compact?: boolean;
  eager?: boolean;
  /** Rail keeps the dense tile. Visual is the photo-led search and home card. */
  presentation?: "rail" | "visual";
}) {
  const { t, locale } = useCopy();
  const name = displayCentreName(locale === "fr" ? item.nameFr : item.name);
  const live = Boolean(item.live);
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const distanceKm = kmBetween(origin, { lat: item.lat, lng: item.lng });
  const feeBadge = confirmedFeeProgramBadge(item);
  const feeOk = item.fromPrice > 0 && (live || Boolean(item.feeConfirmed) || Boolean(feeBadge));
  const gaps = liveLookingGaps(item);
  const vacancy = honestVacancy(item);
  const freshness = vacancyLine(item, t, locale);
  const incompleteLabel = parentIncompleteLabel(item, t);
  const freshnessText = freshness.kind === "unknown" ? "" : vacancy.kind === "open" || vacancy.kind === "waitlist" ? freshness.text : "";
  const GAP_COPY = {
    ages: "cardGapAges",
    fees: "cardGapFees",
    photo: "cardGapPhoto",
  } as const;
  const away = located ? `${displayDistance(distanceKm, "km")} ${t("kmAway")}` : "";
  const photos = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));
  const hollowPhoto = !photos.some((p) => isRealListingPhoto(p));

  const license = publicLicenseBadge(item);
  const cardTrust = trustBadgesFor(item, "card");
  const showLivePill = showCardLivePill(live, publicApprovalEligible(item));
  const feePillKey = cardFeePillLabelKey(feeBadge);
  const feePillLabel = feePillKey ? t(feePillKey) : "";
  const licenseWarning =
    license && !isCatalogueMatchedBadge(license) && cardPhotoLicenseWarning(license.id) ? license : null;
  const loc = locale === "fr" ? "fr" : "en";
  const ages = listingAgeRangeText(item, "months", loc);
  const hours = displayListingText(item.hours).replace(/Monday to Friday/i, "Mon–Fri").trim();
  const facility = classifyFacilityType(item);
  const typeLabel = facilityTypeSeoKind(facility.type, loc);
  const ageChips = listingAgeChips(item);
  const line3 = [typeLabel, ages, hours].filter(Boolean).join(" · ");
  const photosAge = photoLine(item, t, locale);
  const photoText = photosAge.kind === "unknown" ? "" : photosAge.text;
  const spotsKnown =
    vacancy.kind === "open"
      ? `${vacancy.spots} ${t("spots")}`
      : vacancy.kind === "waitlist"
        ? t("waitlist")
        : t(vacancy.labelKey);
  const priceAmount =
    feeBadge === "badgeTen" ? "$10" : feeBadge === "badgeFifteen" ? "$15" : feeOk ? money(item.fromPrice, locale) : "";
  const priceUnit = feeBadge === "badgeTen" || feeBadge === "badgeFifteen" ? " / day" : feeOk ? t("month") : "";
  const showParentAverage = (item.parentReviewCount ?? 0) >= MIN_REVIEW_COUNT && (item.parentRatingX10 ?? 0) > 0;

  if (presentation === "visual") {
    const placeLine = [item.city, away].filter(Boolean).join(" · ");
    const careLine = [ages, hours].filter(Boolean).join(" · ");
    return (
      <article data-slug={item.slug} data-ke="visual-card" className="ke-visual-card group w-full">
        <div className="relative">
          <Link to="/daycare/$slug" params={{ slug: item.slug }} className="block text-inherit no-underline">
            <PhotoCarousel
              photos={photos}
              eager={eager}
              rounded="rounded-[14px]"
              className="aspect-[4/3] bg-[#EBEBEB]"
            />
            <CardPhotoBadges
              item={item}
              compact={false}
              hollowPhoto={hollowPhoto}
              live={live}
              showLivePill={showLivePill}
              feeLabel={feePillLabel}
              licenseWarning={licenseWarning}
            />
          </Link>
          <SaveListingButton daycareId={item.id} />
        </div>
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="mt-2 block text-inherit no-underline">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 min-w-0 whitespace-normal text-[15px] font-semibold leading-5 tracking-[-0.02em] text-fg">
              {name}
            </h3>
            {showParentAverage ? (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[13px] leading-none tabular-nums">
                <Star className="size-3 fill-fg text-fg" strokeWidth={0} />
                <span className="font-semibold">{((item.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
                <span className="font-normal text-muted">({item.parentReviewCount})</span>
              </span>
            ) : null}
          </div>
          {placeLine ? <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{placeLine}</p> : null}
          {publicApprovalEligible(item) ? (
            <p className="mt-0.5 text-[12px] font-medium leading-4 text-primary" data-ke="kidease-approved-marker">
              {t("kideaseApprovedMarker")}
            </p>
          ) : null}
          {careLine ? <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{careLine}</p> : null}
          {priceAmount ? (
            <p className="mt-1 text-[14px] leading-5 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-muted">{priceUnit}</span>
            </p>
          ) : null}
        </Link>
        <Link
          to="/daycare/$slug"
          params={{ slug: item.slug }}
          search={{ ask: "info" }}
          data-ke="card-request-info"
          className="relative z-10 mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {t("cardRequestInfo")}
        </Link>
      </article>
    );
  }

  return (
    <article data-slug={item.slug} className="ke-tile group w-full">
      <div className="relative">
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="block text-inherit no-underline">
          <PhotoCarousel
            photos={photos}
            eager={eager}
            rounded="rounded-[14px]"
            className="aspect-[3/2] bg-[#EBEBEB]"
          />
          <CardPhotoBadges
            item={item}
            compact={compact}
            hollowPhoto={hollowPhoto}
            live={live}
            showLivePill={showLivePill}
            feeLabel={feePillLabel}
            licenseWarning={licenseWarning}
            clearShare={!compact}
          />
        </Link>
        {!compact ? (
          <CompareChip
            id={item.id}
            slug={item.slug}
            className="pointer-events-auto absolute bottom-2 right-2 z-20"
          />
        ) : null}
        {!compact ? (
          <ShareListingButton
            slug={item.slug}
            name={name}
            appearance="photo"
            className="pointer-events-auto absolute right-16 top-2 z-20"
          />
        ) : null}
        <SaveListingButton daycareId={item.id} />
      </div>

      <Link to="/daycare/$slug" params={{ slug: item.slug }} className="block text-inherit no-underline">
        <div className="mt-1 space-y-px text-fg">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[12px] font-semibold leading-[1.25] tracking-[-0.2px] text-fg dark:text-white">
              {name}
            </h3>
            {showParentAverage ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[12px] leading-none tabular-nums" title={t("parentReviews")}>
                <Star className="size-2.5 fill-fg text-fg dark:fill-white dark:text-white" strokeWidth={0} />
                <span className="font-semibold">{((item.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
                <span className="font-normal text-muted">({item.parentReviewCount})</span>
              </span>
            ) : null}
          </div>
          {!compact && publicApprovalEligible(item) ? (
            <p className="text-[11px] font-medium leading-4 text-primary" data-ke="kidease-approved-marker">
              {t("kideaseApprovedMarker")}
            </p>
          ) : null}
          {!compact && cardTrust.length ? (
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
            <p className="truncate text-[12px] font-normal leading-4 text-muted">
              {item.city}
              {away ? ` · ${away}` : ""}
            </p>
          ) : (
            <p className="truncate text-[12px] font-normal leading-4 text-muted">{item.city}</p>
          )}
          {line3 ? <p className="truncate text-[12px] font-normal leading-4 text-muted">{line3}</p> : null}
          {gaps.length ? (
            <p className="truncate text-[12px] font-normal leading-4 text-muted">
              {gaps.map((gap) => t(GAP_COPY[gap])).join(" · ")}
            </p>
          ) : incompleteLabel ? (
            <p className="truncate text-[12px] font-normal leading-4 text-muted">{incompleteLabel}</p>
          ) : null}
          {spotsKnown ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="ke-honesty">{spotsKnown}</span>
              {!compact && freshnessText ? <span className="ke-honesty">{freshnessText}</span> : null}
              {!compact && !hollowPhoto && photoText ? <span className="ke-honesty">{photoText}</span> : null}
              {!compact ? <MatchCue score={canShowMatchScore(item) ? item.matchScore : undefined} compact /> : null}
              {!compact ? <UrgencyCue score={item.urgencyScore} compact /> : null}
            </div>
          ) : null}
          {!compact && ageChips.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {ageChips.map((band) => (
                <span key={band} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium">
                  {parentAgeLabel(band, loc)}
                </span>
              ))}
            </div>
          ) : null}
          {priceAmount ? (
            <p className="pt-0.5 text-[12px] leading-4 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-muted">{priceUnit}</span>
            </p>
          ) : (
            <p className="pt-0.5 text-[12px] leading-4 text-muted">{t("cardGapFees")}</p>
          )}
        </div>
      </Link>
      <Link
        to="/daycare/$slug"
        params={{ slug: item.slug }}
        search={{ ask: "info" }}
        data-ke="card-request-info"
        className="relative z-10 mt-1.5 inline-flex h-9 min-h-9 appearance-none items-center rounded-[14px] border-0 bg-primary px-2.5 text-[11px] font-semibold text-primary-fg no-underline shadow-none [-moz-appearance:none]"
        onClick={(e) => e.stopPropagation()}
      >
        {t("cardRequestInfo")}
      </Link>
    </article>
  );
});
