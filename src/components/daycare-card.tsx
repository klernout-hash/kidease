import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { PhotoCarousel } from "@/components/photo-carousel";
import { ShareListingButton } from "@/components/share-button";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, money } from "@/lib/utils";
import { distanceKm as kmBetween } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { displayDistance } from "@/lib/units";
import { readCompare, toggleCompare } from "@/lib/compare";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { listingPill } from "@/lib/listing-card";
import { publicLicenseBadge } from "@/lib/license-verify";
import type { CopyKey } from "@/lib/copy";
import { photoLine, vacancyLine } from "@/components/vacancy-freshness";
import { parentIncompleteLabel } from "@/components/listing-completeness";
import { TrustBadge, TrustSignals } from "@/components/trust-badge";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { MatchCue, UrgencyCue } from "@/components/rank-cues";

const HEART_SAVED = "#FF385C";

export function DaycareCard({
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
  const [picked, setPicked] = useState(false);
  const feeBadge = feeProgramBadgeKey(item.province);
  const away = located ? `${displayDistance(distanceKm, distanceUnit)} ${distanceUnit === "mi" ? t("miAway") : t("kmAway")}` : "";
  const photos = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));

  useEffect(() => {
    function sync() {
      setPicked(readCompare().includes(item.id));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [item.id]);

  const license = publicLicenseBadge(item);
  const pillKey = listingPill(item)?.labelKey;
  const pill = pillKey ? t(pillKey as CopyKey) : "";
  const showLicensedChip = Boolean(license && pillKey !== license.labelKey);
  const ages =
    item.ageMaxMonths > item.ageMinMonths ? `${item.ageMinMonths}–${item.ageMaxMonths} months` : "";
  const hours = (item.hours || "").replace(/Monday to Friday/i, "Mon–Fri").trim();
  const line3 = [ages, hours].filter(Boolean).join(" · ");
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
            {showLicensedChip && license ? (
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

        <div className="mt-2 space-y-px text-[#222]">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[13px] font-semibold leading-[1.25] tracking-[-0.2px]">{name}</h3>
            {item.parentReviewCount && item.parentReviewCount > 0 && (item.parentRatingX10 ?? 0) > 0 ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[12px] leading-none tabular-nums" title={t("parentReviews")}>
                <Star className="size-2.5 fill-[#222] text-[#222]" strokeWidth={0} />
                <span className="font-semibold">{((item.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
                <span className="font-normal text-[#6A6A6A]">({item.parentReviewCount})</span>
              </span>
            ) : item.ratingX10 > 0 && item.reviewCount > 0 ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[12px] leading-none tabular-nums">
                <Star className="size-2.5 fill-[#222] text-[#222]" strokeWidth={0} />
                <span className="font-semibold">{(item.ratingX10 / 10).toFixed(2)}</span>
                <span className="font-normal text-[#6A6A6A]">({item.reviewCount})</span>
              </span>
            ) : null}
          </div>
          <div
            className="pt-0.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <TrustSignals item={item} surface="card" compact />
          </div>
          {showDistance ? (
            <p className="truncate text-[13px] font-normal leading-4 text-[#6A6A6A]">
              {item.city}
              {away ? ` · ${away}` : ""}
            </p>
          ) : (
            <p className="truncate text-[13px] font-normal leading-4 text-[#6A6A6A]">{item.city}</p>
          )}
          {line3 ? <p className="truncate text-[13px] font-normal leading-4 text-[#6A6A6A]">{line3}</p> : null}
          {incompleteLabel ? (
            <p className="truncate text-[12px] font-normal leading-4 text-[#6A6A6A]">{incompleteLabel}</p>
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
              <span className="font-normal text-[#6A6A6A]">{priceUnit}</span>
            </p>
          ) : null}
        </div>
      </Link>
      <ShareListingButton
        slug={item.slug}
        name={name}
        appearance="photo"
        className="absolute right-12 top-2 z-20"
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleCompare(item.id);
        }}
        className="absolute right-2 top-2 z-20 grid size-11 place-items-center rounded-full"
        aria-label={t("saved")}
      >
        <Heart
          className={cn(
            "size-[22px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
            picked ? "text-[#FF385C]" : "text-white",
          )}
          strokeWidth={1.7}
          fill={picked ? HEART_SAVED : "rgba(0,0,0,0.28)"}
        />
      </button>
    </article>
  );
}
