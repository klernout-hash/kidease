import { Link } from "@tanstack/react-router";
import { Heart, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto } from "@/components/building-photo";
import { useCopy } from "@/lib/use-copy";
import { cn, money, formatAgeRange } from "@/lib/utils";
import { readCompare, toggleCompare } from "@/lib/compare";
import { feeBadgeKey, licenseRecordUrl } from "@/lib/licensing";
import { PriorityPill } from "@/components/priority-pill";

export function DaycareCard({
  item,
  showDistance = true,
  cta = "book",
  compact = false,
}: {
  item: Card;
  showDistance?: boolean;
  cta?: "book" | "details";
  compact?: boolean;
}) {
  const { t, locale } = useCopy();
  const name = locale === "fr" ? item.nameFr : item.name;
  const building = item.photos.find((p) => !p.includes("-logo")) ?? item.photos[0] ?? "/photos/storefront-placeholder.jpg";
  const logo = item.photos.find((p) => p.includes("-logo"));
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown || live);
  const open = item.spotsTotal > 0;
  const feeOk = live && item.fromPrice > 0;
  const [picked, setPicked] = useState(false);
  const licenceHref = licenseRecordUrl(item.province, item.name, item.licenseNumber);

  useEffect(() => {
    function sync() {
      setPicked(readCompare().includes(item.id));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [item.id]);

  if (compact) {
    return (
      <div className="relative w-full">
        <Link to="/daycare/$slug" params={{ slug: item.slug }} className="group block">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
            <BuildingPhoto
              src={building}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            {item.priority ? (
              <span className="absolute left-2 top-2">
                <PriorityPill />
              </span>
            ) : null}
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-4 tracking-[-0.015em]">{name}</h3>
              <GoogleRating item={item} ratingX10={item.ratingX10} reviewCount={item.reviewCount} compact asButton />
            </div>
            <p className="truncate text-[12px] text-muted">
              {showDistance && item.distanceKm ? `${item.distanceKm} ${t("kmAway")}` : item.city}
              {known && open ? ` · ${item.spotsTotal} ${t("spots")}` : known && !open ? ` · ${t("waitlist")}` : ""}
            </p>
            {feeOk ? (
              <p className="text-[13px] tabular-nums">
                <span className="font-semibold">{money(item.fromPrice, locale)}</span>
                <span className="text-muted">{t("month")}</span>
              </p>
            ) : (
              <p className="text-[12px] text-muted">{t("feeUnknown")}</p>
            )}
          </div>
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleCompare(item.id);
          }}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-surface/90 text-fg shadow-card ring-1 ring-border"
          aria-label={t("compare")}
        >
          <Heart className={cn("size-3.5", picked ? "fill-primary text-primary" : "")} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-surface shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        live ? "ke-live-pulse border-2 border-primary" : "border border-border",
      )}
    >
      <Link to="/daycare/$slug" params={{ slug: item.slug }} className="group block">
        <div className="relative aspect-square overflow-hidden bg-surface-2">
          <BuildingPhoto
            src={building}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          {logo ? (
            <span className="absolute bottom-3 right-3 grid h-12 max-w-[7.5rem] place-items-center overflow-hidden rounded-md bg-surface/95 px-1.5 py-1 shadow-[var(--shadow-card)] ring-1 ring-border">
              <img src={logo} alt="" className="max-h-10 max-w-[6.5rem] object-contain" />
            </span>
          ) : null}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {item.priority ? <PriorityPill /> : null}
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-fg">
              {t(feeBadgeKey(item.province))}
            </span>
            {known ? (
              <span className={open ? "rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium" : "rounded-full bg-fg/80 px-2 py-0.5 text-[11px] font-medium text-surface"}>
                {open ? `${item.spotsTotal} ${t("spots")}` : t("waitlist")}
              </span>
            ) : (
              <span className="rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-muted">{t("availUnknown")}</span>
            )}
            {live ? (
              <span className="rounded-full bg-ok px-2 py-0.5 text-[11px] font-medium text-primary-fg">{t("live")}</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-1 p-3 pb-2.5">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-5 tracking-[-0.015em]">{name}</h3>
          <GoogleRating item={item} ratingX10={item.ratingX10} reviewCount={item.reviewCount} compact asButton />
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            {item.agesKnown ? (
              <>
                <p className="min-w-0 truncate text-muted">
                  {[
                    item.ageMinMonths <= 18 ? t("infant") : null,
                    item.ageMinMonths < 36 && item.ageMaxMonths >= 18 ? t("toddler") : null,
                    item.ageMaxMonths >= 30 && item.ageMinMonths < 72 ? t("preschool") : null,
                    item.ageMaxMonths >= 72 && item.ageMinMonths >= 60 ? t("schoolAge") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="shrink-0 tabular-nums text-muted">{formatAgeRange(item.ageMinMonths, item.ageMaxMonths)}</p>
              </>
            ) : (
              <p className="text-muted">{t("agesUnknown")}</p>
            )}
          </div>
          <div className="flex items-center justify-between pt-0.5 text-[13px]">
            <span className="inline-flex items-center gap-1 text-muted">
              <MapPin className="size-3.5" />
              {showDistance && item.distanceKm ? `${item.distanceKm} ${t("kmAway")}` : item.city}
            </span>
            {feeOk ? (
              <span className="tabular-nums">
                <span className="text-muted">{t("monthlyFrom")} </span>
                <span className="font-semibold tabular-nums">{money(item.fromPrice, locale)}</span>
                <span className="text-muted">{t("month")}</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-muted">{t("feeUnknown")}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
        <Link
          to="/daycare/$slug"
          params={{ slug: item.slug }}
          className="font-sans text-sm font-medium text-primary"
        >
          {cta === "details" ? t("viewDetails") : live ? t("book") : t("viewDetails")}
        </Link>
        <a
          href={licenceHref}
          target="_blank"
          rel="noreferrer"
          className="font-sans text-sm font-medium text-primary"
        >
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
          "absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-card ring-1",
          picked ? "bg-fg text-bg ring-fg" : "bg-surface/95 text-fg ring-border",
        )}
      >
        {picked ? t("comparing") : t("compare")}
      </button>
    </div>
  );
}
