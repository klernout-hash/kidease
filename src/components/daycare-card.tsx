import { Link } from "@tanstack/react-router";
import { Heart, MapPin, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { BuildingPhoto } from "@/components/building-photo";
import { GoogleRating } from "@/components/google-rating";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, formatAgeRange, money } from "@/lib/utils";
import { distanceKm as kmBetween, proximityBand } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { displayDistance } from "@/lib/units";
import { readCompare, toggleCompare } from "@/lib/compare";
import { PriorityPill } from "@/components/priority-pill";
import { feeProgramBadgeKey, licenseRecordUrl, officialLicenceNumber } from "@/lib/licensing";
import { ListingContact } from "@/components/listing-contact";
import { listingThumb } from "@/lib/listing-photo";

export function DaycareCard({
  item,
  showDistance = true,
  cta = "details",
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
  const building = listingThumb(item.photos);
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown || live);
  const open = item.spotsTotal > 0;
  const feeOk = (live || Boolean(item.feeConfirmed)) && item.fromPrice > 0;
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const distanceKm = kmBetween(origin, { lat: item.lat, lng: item.lng });
  const band = proximityBand(distanceKm);
  const bandLabel =
    band === "walk" ? t("bandWalk") : band === "nearby" ? t("bandNearby") : band === "commute" ? t("bandCommute") : t("bandDrive");
  const [picked, setPicked] = useState(false);
  const licenceNo = officialLicenceNumber(item.licenseNumber, item.id);
  const licenceHref = licenseRecordUrl(item.province, item.name, licenceNo);
  const away = `${displayDistance(distanceKm, distanceUnit)} ${distanceUnit === "mi" ? t("miAway") : t("kmAway")}`;
  const kmLine = located ? away : t("locating");
  const kmWeb = located ? `${away} · ${bandLabel}` : t("locating");

  useEffect(() => {
    function sync() {
      setPicked(readCompare().includes(item.id));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [item.id]);

  const feeBadge = feeProgramBadgeKey(item.province);
  const badges = (
    <>
      {item.priority ? <PriorityPill /> : null}
      {feeBadge ? (
        <span className="ke-badge-pulse shrink-0 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary-fg">
          {t(feeBadge)}
        </span>
      ) : null}
      {live ? (
        <span className="ke-live-badge-pulse shrink-0 whitespace-nowrap rounded-full bg-ok px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary-fg">
          {t("live")}
        </span>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <article data-slug={item.slug} className="ke-tile group relative w-full">
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="block">
          <div className="relative aspect-[20/19] overflow-hidden rounded-xl bg-surface-2">
            <BuildingPhoto
              src={building}
              eager={eager}
              alt=""
              className="size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-x-2 top-2 z-[1] flex flex-nowrap items-center gap-1 overflow-hidden">{badges}</div>
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 tracking-[-0.015em]">{name}</h3>
              {item.ratingX10 > 0 && item.reviewCount > 0 ? (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium tabular-nums">
                  <Star className="size-3 fill-fg text-fg" strokeWidth={0} />
                  {(item.ratingX10 / 10).toFixed(2)}
                </span>
              ) : null}
            </div>
            {showDistance ? <p className="truncate text-[13px] leading-5 text-muted tabular-nums">{kmLine}</p> : null}
            {item.ageMaxMonths > item.ageMinMonths ? (
              <p className="truncate text-[13px] leading-5 text-muted">
                {t("agesShort")} {formatAgeRange(item.ageMinMonths, item.ageMaxMonths)}
              </p>
            ) : null}
            {known && open ? (
              <p className="truncate text-[13px] leading-5 text-muted">
                {t("spotsAvailable")} {item.spotsTotal}
              </p>
            ) : null}
            {feeOk ? (
              <p className="pt-0.5 text-[14px] leading-5 tabular-nums">
                <span className="font-semibold">{money(item.fromPrice, locale)}</span>
                <span className="text-muted">{t("month")}</span>
              </p>
            ) : null}
          </div>
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCompare(item.id);
          }}
          className="absolute right-2 top-2 z-20 grid size-9 place-items-center rounded-full text-white drop-shadow-md"
          aria-label={t("saved")}
        >
          <Heart className={cn("size-5", picked ? "fill-primary text-primary" : "fill-black/25 text-white")} strokeWidth={1.6} />
        </button>
      </article>
    );
  }

  return (
    <>
      <article className="ke-card relative hidden w-full [[data-channel=app]_&]:block">
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="group block">
          <div
            className={cn("rounded-[1.25rem] p-3", live ? "ke-live-pulse" : "ke-muted-pulse")}
            style={{ animationDelay: `${(item.id.charCodeAt(item.id.length - 1) % 9) * 0.12}s` }}
          >
            <div className="ke-card-photo relative overflow-hidden rounded-[0.9rem] bg-surface-2">
              <BuildingPhoto src={building} eager={eager} alt="" className="size-full object-cover object-center" />
              <div className="absolute inset-x-2 top-2 z-[1] flex flex-nowrap items-center gap-1 overflow-hidden">{badges}</div>
            </div>
          </div>
          <div className="space-y-1.5 px-3 pb-1 pt-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-6 tracking-[-0.01em]">{name}</h3>
              {item.ratingX10 > 0 && item.reviewCount > 0 ? (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium leading-6 tabular-nums">
                  <Star className="size-3.5 fill-primary text-primary" strokeWidth={0} />
                  {(item.ratingX10 / 10).toFixed(1)}
                </span>
              ) : null}
            </div>
            {showDistance ? <p className="truncate text-[13px] leading-5 text-muted tabular-nums">{kmLine}</p> : null}
            <p className="truncate text-[13px] leading-5">
              {item.ageMaxMonths > item.ageMinMonths ? (
                <>
                  <span className="text-muted">{t("agesShort")} </span>
                  <span className="font-medium tabular-nums">{formatAgeRange(item.ageMinMonths, item.ageMaxMonths)}</span>
                </>
              ) : (
                <span className="text-muted">{t("agesUnknown")}</span>
              )}
            </p>
            {licenceNo ? (
              <p className="truncate text-[12px] leading-5 text-muted tabular-nums">
                {t("license")} {licenceNo}
              </p>
            ) : null}
            {known && open ? (
              <p className="flex items-baseline justify-between gap-2 text-[13px] leading-5">
                <span className="text-muted">{t("spotsAvailable")}</span>
                <span className="font-semibold tabular-nums">{item.spotsTotal}</span>
              </p>
            ) : known ? (
              <p className="text-[13px] font-semibold leading-5">{t("waitlist")}</p>
            ) : (
              <p className="text-[13px] leading-5 text-muted">{t("availUnknown")}</p>
            )}
            {feeOk ? (
              <p className="text-[14px] leading-6 tabular-nums">
                <span className="font-semibold">{money(item.fromPrice, locale)}</span>
                <span className="text-muted">{t("month")}</span>
              </p>
            ) : (
              <p className="text-[13px] leading-5 text-muted">{t("feeUnknown")}</p>
            )}
          </div>
        </Link>
        <div className="px-3 pb-3">
          <ListingContact name={name} slug={item.slug} city={item.city} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleCompare(item.id);
          }}
          className="absolute -right-0.5 -top-0.5 z-20 grid size-11 place-items-center rounded-full bg-surface/95 text-fg shadow-card ring-1 ring-border"
          aria-label={t("compare")}
        >
          <Heart className={cn("size-3.5", picked ? "fill-primary text-primary" : "")} strokeWidth={1.75} />
        </button>
      </article>

      <article
        className={cn(
          "relative overflow-hidden rounded-xl bg-surface shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lift [[data-channel=app]_&]:hidden",
          live ? "ke-live-pulse border-2 border-primary" : "border border-border",
        )}
      >
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="group block">
          <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
            <BuildingPhoto src={building} eager={eager} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="absolute left-3 top-3 flex flex-nowrap items-center gap-1.5 overflow-hidden">{badges}</div>
          </div>
          <div className="space-y-1.5 p-3.5 pb-3">
            <h3 className="text-[15px] font-semibold leading-5 tracking-[-0.015em]">{name}</h3>
            <GoogleRating item={item} ratingX10={item.ratingX10} reviewCount={item.reviewCount} compact asButton />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {item.ageMaxMonths > item.ageMinMonths ? (
                <>
                  <p className="min-w-0 truncate text-muted">{t("agesShort")}</p>
                  <p className="shrink-0 tabular-nums text-muted">{formatAgeRange(item.ageMinMonths, item.ageMaxMonths)}</p>
                </>
              ) : (
                <p className="text-muted">{t("agesUnknown")}</p>
              )}
            </div>
            {licenceNo ? (
              <p className="truncate text-[12px] leading-5 text-muted tabular-nums">
                {t("license")} {licenceNo}
              </p>
            ) : null}
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="inline-flex items-center gap-1 text-muted">
                <MapPin className="size-3.5" />
                {showDistance ? kmWeb : item.city}
              </span>
              {feeOk ? (
                <span className="tabular-nums">
                  <span className="font-semibold">{money(item.fromPrice, locale)}</span>
                  <span className="text-muted">{t("month")}</span>
                </span>
              ) : (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{t("feeUnknown")}</span>
              )}
            </div>
            {item.inCatchment ? (
              <p className="text-[12px] font-semibold text-primary">{t("servesArea")}</p>
            ) : null}
            {known && open ? (
              <p className="text-[13px] text-muted">
                {t("spotsAvailable")} <span className="font-semibold text-fg tabular-nums">{item.spotsTotal}</span>
              </p>
            ) : known ? (
              <p className="text-[13px] font-semibold">{t("waitlist")}</p>
            ) : null}
          </div>
        </Link>
        <div className="flex min-h-12 items-center justify-between gap-2 border-t border-border px-3.5 py-2.5">
          <Link to="/daycare/$slug" params={{ slug: item.slug }} className="inline-flex min-h-11 items-center font-sans text-sm font-medium text-primary">
            {cta === "details" ? t("viewDetails") : live ? t("book") : t("viewDetails")}
          </Link>
          <ListingContact name={name} slug={item.slug} city={item.city} className="inline-flex min-h-11 items-center" />
          <a href={licenceHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-sans text-sm font-medium text-primary">
            {t("viewLicenceShort")}
          </a>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleCompare(item.id);
          }}
          className={cn(
            "absolute right-3 top-3 min-h-11 rounded-full px-3 text-[11px] font-medium shadow-card ring-1",
            picked ? "bg-fg text-bg ring-fg" : "bg-surface/95 text-fg ring-border",
          )}
        >
          {picked ? t("comparing") : t("compare")}
        </button>
      </article>
    </>
  );
}
