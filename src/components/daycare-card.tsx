import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { memo, type MouseEvent, type ReactNode } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { isSafeSitemapSlug } from "@/lib/sitemap";
import { PhotoCarousel } from "@/components/photo-carousel";
import { FoundingMemberBadge } from "@/components/founding-member-badge";
import { SaveListingButton } from "@/components/save-listing-button";
import { ClaimListingCta } from "@/components/claim-listing-cta";
import { ShareListingButton } from "@/components/share-button";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, displayListingText, money } from "@/lib/utils";
import { distanceKm as kmBetween } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import type { CopyKey } from "@/lib/copy";
import { parentDistanceLabel } from "@/lib/distance-label";
import { originIsParentLocation } from "@/lib/presence";
import { plausibleListingKm } from "@/lib/plausible-distance";
import { listingAgeRangeText } from "@/lib/listing-ages";
import { classifyFacilityType, facilityTypeSeoKind } from "@/lib/facility-type";
import { publicLicenseBadge } from "@/lib/license-verify";
import { licenseRecordUrl, officialLicenceNumber } from "@/lib/licensing";
import { isCatalogueMatchedBadge, trustBadgesFor, type TrustBadge as TrustBadgeModel } from "@/lib/trust";
import { publicApprovalEligible, showPublicClaimPrompt } from "@/lib/approve-live";
import {
  cardPhotoLicenseWarning,
  showCardLivePill,
} from "@/lib/card-photo-pills";
import { parentIncompleteLabel } from "@/components/listing-completeness";
import { photoLine, vacancyLine } from "@/components/vacancy-freshness";
import { TrustBadge, TrustSignals } from "@/components/trust-badge";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";
import { CompareChip } from "@/components/compare-chip";
import {
  canShowMatchScore,
  honestVacancy,
  liveLookingGaps,
} from "@/lib/now-loops";
import { listingAgeChips, parentAgeLabel } from "@/lib/parent-listing";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { MIN_REVIEW_COUNT } from "@/lib/quality";
import { listingSubsidy } from "@/lib/fee-program";
import { SubsidyPill } from "@/components/subsidy-pill";

function whyMatchLine(
  item: Card,
  t: (key: CopyKey) => string,
): string {
  const who: Record<string, CopyKey> = {
    infant: "whySpotsWhoInfant",
    toddler: "whySpotsWhoToddler",
    preschool: "whySpotsWhoPreschool",
    "school-age": "whySpotsWhoSchool",
    any: "whySpotsWhoAny",
  };
  const parts = (item.smartMatchWhy ?? []).map((reason) => {
    if (reason.code === "close_work") return t("whyCloseWork");
    if (reason.code === "close_home") return t("whyCloseHome");
    if (reason.code === "age_fit") {
      if (reason.age === "infant") return t("whyAgeInfant");
      if (reason.age === "toddler") return t("whyAgeToddler");
      if (reason.age === "preschool") return t("whyAgePreschool");
      if (reason.age === "school-age") return t("whyAgeSchool");
    }
    if (reason.code === "spots_fresh") {
      const label = t(who[reason.age || "any"] ?? "whySpotsWhoAny");
      if (reason.days === 0) return t("whySpotsToday").replace("{who}", label);
      if (reason.days === 1) return t("whySpotsOne").replace("{who}", label);
      return t("whySpotsDays").replace("{who}", label).replace("{n}", String(reason.days ?? ""));
    }
    if (reason.code === "subsidy") return t("whySubsidy");
    if (reason.code === "hours_days") return t("whyHoursDays");
    if (reason.code === "complete") return t("whyComplete");
    if (reason.code === "claim_verified") return t("whyClaim");
    return "";
  });
  return parts.filter(Boolean).join(" · ");
}

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
  licenseWarning,
  clearShare = false,
}: {
  item: Card;
  compact: boolean;
  hollowPhoto: boolean;
  live: boolean;
  showLivePill: boolean;
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
      {showLivePill || listingSubsidy(item) ? (
        <div className="flex flex-wrap items-center gap-1" data-ke="card-photo-pills">
          {showLivePill ? (
            <span data-ke="card-live-pill" className={cn(LIVE_PILL, pill)}>
              {t("live")}
            </span>
          ) : null}
          <SubsidyPill item={item} className={cn(FEE_PILL, pill)} />
        </div>
      ) : null}
      {hollowPhoto && live ? (
        <span
          className={cn(
            "inline-flex rounded-full bg-black/40 font-normal text-white/80",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]",
          )}
        >
          {t("photoPending")}
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

function ListingAnchor({
  slug,
  className,
  search,
  onClick,
  children,
  "data-ke": dataKe,
  label,
}: {
  slug: string;
  className?: string;
  search?: { ask: "info" };
  onClick?: (event: MouseEvent) => void;
  children: ReactNode;
  "data-ke"?: string;
  label?: string;
}) {
  const { locale } = useCopy();
  if (!isSafeSitemapSlug(slug)) {
    return (
      <div className={className} data-ke={dataKe}>
        {children}
      </div>
    );
  }
  return (
    <Link
      to={localePath(`/daycare/${slug}`, locale)}
      search={search}
      className={className}
      data-ke={dataKe}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

function ProvincialOpeningLine({ item }: { item: Card }) {
  const { t, locale } = useCopy();
  const row = item.provincialOpening;
  if (!row) return null;
  const date = new Date(row.asOf);
  const label = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
  const ages = row.ageLabel === "All ages" ? t("provincialOpeningsAllAges") : "";
  return (
    <p className="mt-0.5 text-[13px] leading-5 text-muted" data-ke="provincial-openings">
      {t("provincialOpenings")} · {row.total}
      {ages ? ` · ${ages}` : ""}
      {label ? ` · ${t("provincialOpeningsAsOf").replace("{date}", label)}` : ""}
    </p>
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
  const originSource = useAppStore((s) => s.originSource);
  const sort = useAppStore((s) => s.sort);
  const distanceKm = kmBetween(origin, { lat: item.lat, lng: item.lng });
  const subsidy = listingSubsidy(item);
  const feeOk = item.fromPrice > 0 && (live || Boolean(item.feeConfirmed) || Boolean(subsidy));
  const gaps = liveLookingGaps(item);
  const vacancy = honestVacancy(item);
  const freshness = vacancyLine(item, t, locale);
  const incompleteLabel = parentIncompleteLabel(item, t);
  const freshnessText = freshness.kind === "unknown" ? t("vacancyNotConfirmed") : freshness.text;
  const GAP_COPY = {
    ages: "cardGapAges",
    fees: "cardGapFees",
    photo: "cardGapPhoto",
  } as const;
  const away = parentDistanceLabel({
    km: distanceKm,
    away: t("kmAway"),
    show:
      originIsParentLocation(originSource) &&
      plausibleListingKm(distanceKm, item.city, origin.label),
  });
  const photos = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));
  const hollowPhoto = !photos.some((p) => isRealListingPhoto(p));
  const offerClaim = showPublicClaimPrompt(item);

  const license = publicLicenseBadge(item);
  const licenceNo = officialLicenceNumber(item.licenseNumber, item.id);
  const licenceHref = licenceNo ? licenseRecordUrl(item.province, name, item.licenseNumber) : "";
  const cardTrust = trustBadgesFor(item, "card");
  const showLivePill = showCardLivePill(live, publicApprovalEligible(item));
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
  const openSpotsLine = vacancy.kind === "open" || vacancy.kind === "waitlist" ? spotsKnown : "";
  const daily = subsidy?.subsidy_type === "ten" || subsidy?.subsidy_type === "ten_max" || subsidy?.subsidy_type === "qc_965";
  const priceAmount = subsidy?.subsidy_type === "qc_965"
    ? "$9.65"
    : subsidy?.subsidy_type === "ten" || subsidy?.subsidy_type === "ten_max"
      ? "$10"
      : feeOk
        ? money(item.fromPrice, locale)
        : "";
  const priceUnit = subsidy?.subsidy_type === "ten_max" ? " / day max" : daily ? " / day" : feeOk ? t("month") : "";
  const priceOnPhoto = daily;
  const showParentAverage = (item.parentReviewCount ?? 0) >= MIN_REVIEW_COUNT && (item.parentRatingX10 ?? 0) > 0;

  if (presentation === "visual") {
    const placeLine = [item.city, away].filter(Boolean).join(" · ");
    return (
      <article data-slug={item.slug} data-ke="visual-card" className="ke-visual-card group w-full min-w-0">
        <div className="relative">
          <ListingAnchor slug={item.slug} label={name} className="block text-inherit no-underline">
            <PhotoCarousel
              photos={photos}
              eager={eager}
              claim={offerClaim}
              rounded="rounded-[14px]"
              className="aspect-[4/3] bg-[#EBEBEB]"
            />
            <CardPhotoBadges
              item={item}
              compact={false}
              hollowPhoto={hollowPhoto}
              live={live}
              showLivePill={showLivePill}
              licenseWarning={licenseWarning}
            />
          </ListingAnchor>
          <SaveListingButton daycareId={item.id} />
        </div>
        <ListingAnchor slug={item.slug} className="mt-2 block text-inherit no-underline">
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
          <FoundingMemberBadge show={item.foundingMember} className="mt-1" />
          {placeLine ? <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{placeLine}</p> : null}
          {sort === "best" && whyMatchLine(item, t) ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted" data-ke="why-match">
              <span className="font-medium text-fg">{t("whyMatch")}. </span>
              {whyMatchLine(item, t)}
            </p>
          ) : null}
          {item.parentFitChips?.length ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-fg" data-ke="parent-fit">
              {item.parentFitChips.map((chip) => (locale === "fr" ? chip.fr : chip.en)).join(" · ")}
            </p>
          ) : null}
          {ages ? (
            <p className="mt-0.5 text-[13px] font-medium leading-5 text-fg" data-ke="card-age-range">
              {ages}
            </p>
          ) : null}
          {openSpotsLine ? (
            <p className="mt-0.5 text-[13px] font-medium leading-5 text-fg" data-ke="card-open-spots">
              {openSpotsLine}
            </p>
          ) : null}
          {freshnessText ? (
            <p className="mt-0.5 text-[13px] leading-5 text-muted" data-ke="vacancy-confirmed">
              {freshnessText}
            </p>
          ) : null}
          <ProvincialOpeningLine item={item} />
          {publicApprovalEligible(item) ? (
            <p className="mt-0.5 truncate text-[12px] font-medium leading-4 text-primary" data-ke="kidease-approved-marker">
              {t("kideaseApprovedMarker")}
            </p>
          ) : null}
          {!priceOnPhoto && priceAmount ? (
            <p className="mt-1 text-[14px] leading-5 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-muted">{priceUnit}</span>
            </p>
          ) : null}
        </ListingAnchor>
        <div className="mt-1 flex w-full min-w-0 flex-col items-start gap-1.5">
          <ListingAnchor
            slug={item.slug}
            search={{ ask: "info" }}
            data-ke="card-request-info"
            className="relative z-10 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary no-underline"
            onClick={(e) => e.stopPropagation()}
          >
            {t("cardRequestInfo")}
          </ListingAnchor>
          {offerClaim ? (
            <ClaimListingCta daycareId={item.id} name={name} source="card" className="relative z-10" />
          ) : null}
        </div>
        {licenceHref ? (
          <a
            href={licenceHref}
            target="_blank"
            rel="noreferrer"
            data-ke="card-licence"
            className="relative z-10 mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-muted no-underline underline-offset-4 hover:text-fg hover:underline"
          >
            {t("viewLicenceRecord")}
          </a>
        ) : null}
      </article>
    );
  }

  return (
    <article data-slug={item.slug} className="ke-tile group min-w-0 w-full">
      <div className="relative">
        <ListingAnchor slug={item.slug} label={name} className="block text-inherit no-underline">
          <PhotoCarousel
            photos={photos}
            eager={eager}
            claim={offerClaim}
            rounded="rounded-[14px]"
            className="aspect-[3/2] bg-[#EBEBEB]"
          />
          <CardPhotoBadges
            item={item}
            compact={compact}
            hollowPhoto={hollowPhoto}
            live={live}
            showLivePill={showLivePill}
            licenseWarning={licenseWarning}
            clearShare={!compact}
          />
        </ListingAnchor>
        {isSafeSitemapSlug(item.slug) && !compact ? (
          <CompareChip
            id={item.id}
            slug={item.slug}
            className="pointer-events-auto absolute bottom-2 right-2 z-20"
          />
        ) : null}
        {isSafeSitemapSlug(item.slug) && !compact ? (
          <ShareListingButton
            slug={item.slug}
            name={name}
            appearance="photo"
            className="pointer-events-auto absolute right-16 top-2 z-20"
          />
        ) : null}
        <SaveListingButton daycareId={item.id} />
      </div>

      <ListingAnchor slug={item.slug} className="block text-inherit no-underline">
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
          {!compact ? <FoundingMemberBadge show={item.foundingMember} className="mt-1" /> : null}
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
              {!compact && !hollowPhoto && photoText ? <span className="ke-honesty">{photoText}</span> : null}
              {!compact ? <MatchCue score={canShowMatchScore(item) ? item.matchScore : undefined} compact /> : null}
              {!compact ? <UrgencyCue score={item.urgencyScore} compact /> : null}
            </div>
          ) : null}
          {freshnessText ? (
            <p className="text-[12px] leading-4 text-muted" data-ke="vacancy-confirmed">
              {freshnessText}
            </p>
          ) : null}
          <ProvincialOpeningLine item={item} />
          {!compact && ageChips.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {ageChips.map((band) => (
                <span key={band} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium">
                  {parentAgeLabel(band, loc)}
                </span>
              ))}
            </div>
          ) : null}
          {!priceOnPhoto && priceAmount ? (
            <p className="pt-0.5 text-[12px] leading-4 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-muted">{priceUnit}</span>
            </p>
          ) : !priceOnPhoto ? (
            <p className="pt-0.5 text-[12px] leading-4 text-muted">{t("cardGapFees")}</p>
          ) : null}
        </div>
      </ListingAnchor>
      <div className="mt-1.5 flex w-full min-w-0 flex-col items-start gap-1.5">
        <ListingAnchor
          slug={item.slug}
          search={{ ask: "info" }}
          data-ke="card-request-info"
          className="relative z-10 inline-flex h-9 min-h-9 appearance-none items-center rounded-[14px] border-0 bg-primary px-2.5 text-[11px] font-semibold text-primary-fg no-underline shadow-none [-moz-appearance:none]"
          onClick={(e) => e.stopPropagation()}
        >
          {t("cardRequestInfo")}
        </ListingAnchor>
        {offerClaim ? (
          <ClaimListingCta daycareId={item.id} name={name} source="card" className="relative z-10" />
        ) : null}
      </div>
      {licenceHref && !compact ? (
        <a
          href={licenceHref}
          target="_blank"
          rel="noreferrer"
          data-ke="card-licence"
          className="relative z-10 mt-1 inline-flex min-h-11 items-center text-[12px] font-medium text-muted no-underline underline-offset-4 hover:text-fg hover:underline"
        >
          {t("viewLicenceRecord")}
        </a>
      ) : null}
    </article>
  );
});
