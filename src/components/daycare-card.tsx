import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { PhotoCarousel } from "@/components/photo-carousel";
import { useCopy } from "@/lib/use-copy";
import { cn, displayCentreName, money } from "@/lib/utils";
import { distanceKm as kmBetween } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { displayDistance } from "@/lib/units";
import { readCompare, toggleCompare } from "@/lib/compare";
import { feeProgramBadgeKey } from "@/lib/licensing";

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
  const known = Boolean(item.availabilityKnown || live);
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

  const pill = feeBadge ? t(feeBadge) : live ? t("live") : t("licensed");
  const ages =
    item.ageMaxMonths > item.ageMinMonths ? `${item.ageMinMonths}–${item.ageMaxMonths} months` : "";
  const hours = (item.hours || "").replace(/Monday to Friday/i, "Mon–Fri").trim();
  const line3 = [ages, hours].filter(Boolean).join(" · ");
  const spotsLine = !known ? "" : open ? `${item.spotsTotal} ${t("spots")}` : t("waitlist");
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
          <div className="pointer-events-none absolute left-3 top-3 z-[2]">
            <span className="inline-flex rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold leading-none text-[#222] shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-[8px]">
              {item.priority ? `✦ ${pill}` : pill}
            </span>
          </div>
        </div>

        <div className="mt-2.5 space-y-[3px] text-[#222]">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 truncate text-[15px] font-semibold leading-[1.2] tracking-[-0.2px]">{name}</h3>
            {item.ratingX10 > 0 && item.reviewCount > 0 ? (
              <span className="mt-px inline-flex shrink-0 items-center gap-1 text-[14px] leading-none tabular-nums">
                <Star className="size-3 fill-[#222] text-[#222]" strokeWidth={0} />
                <span className="font-semibold">{(item.ratingX10 / 10).toFixed(2)}</span>
                <span className="font-normal text-[#6A6A6A]">({item.reviewCount})</span>
              </span>
            ) : null}
          </div>
          {showDistance ? (
            <p className="truncate text-[14px] font-normal leading-5 text-[#6A6A6A]">
              {item.city}
              {away ? ` · ${away}` : ""}
            </p>
          ) : (
            <p className="truncate text-[14px] font-normal leading-5 text-[#6A6A6A]">{item.city}</p>
          )}
          {line3 ? <p className="truncate text-[14px] font-normal leading-5 text-[#6A6A6A]">{line3}</p> : null}
          {spotsLine ? <p className="truncate text-[14px] font-normal leading-5 text-[#6A6A6A]">{spotsLine}</p> : null}
          {priceAmount ? (
            <p className="pt-0.5 text-[15px] leading-5 tabular-nums">
              <span className="font-semibold">{priceAmount}</span>
              <span className="font-normal text-[#6A6A6A]">{priceUnit}</span>
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
        className="absolute right-3 top-3 z-20 grid size-8 place-items-center rounded-full"
        aria-label={t("saved")}
      >
        <Heart
          className="size-[26px] text-white"
          strokeWidth={1.7}
          fill={picked ? HEART_SAVED : "rgba(0,0,0,0.28)"}
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))", color: picked ? HEART_SAVED : "#fff" }}
        />
      </button>
    </article>
  );
}
