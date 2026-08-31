import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { BuildingPhoto } from "@/components/building-photo";
import { useCopy } from "@/lib/use-copy";
import { cn, money } from "@/lib/utils";
import { readCompare, toggleCompare } from "@/lib/compare";
import { PriorityPill } from "@/components/priority-pill";

export function DaycareCard({
  item,
  showDistance = true,
}: {
  item: Card;
  showDistance?: boolean;
  cta?: "book" | "details";
  compact?: boolean;
}) {
  const { t, locale } = useCopy();
  const name = locale === "fr" ? item.nameFr : item.name;
  const building = item.photos.find((p) => !p.includes("-logo")) ?? item.photos[0] ?? "/photos/storefront-placeholder.jpg";
  const live = Boolean(item.live);
  const known = Boolean(item.availabilityKnown || live);
  const open = item.spotsTotal > 0;
  const feeOk = live && item.fromPrice > 0;
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    function sync() {
      setPicked(readCompare().includes(item.id));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [item.id]);

  const meta = [
    showDistance && item.distanceKm ? `${item.distanceKm} ${t("kmAway")}` : item.city,
    known && open ? `${item.spotsTotal} ${t("spots")}` : known && !open ? t("waitlist") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="ke-card relative w-full">
      <Link to="/daycare/$slug" params={{ slug: item.slug }} className="group block">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
          <BuildingPhoto src={building} className="size-full object-cover object-center" />
          {item.priority ? (
            <span className="absolute left-2 top-2">
              <PriorityPill />
            </span>
          ) : live ? (
            <span className="absolute left-2 top-2 rounded-full bg-ok px-2 py-0.5 text-[10px] font-semibold text-primary-fg">
              {t("live")}
            </span>
          ) : null}
        </div>
        <div className="mt-2 min-h-[4.75rem]">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-[14px] font-semibold leading-5 tracking-[-0.015em]">{name}</h3>
            {item.ratingX10 > 0 && item.reviewCount > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium tabular-nums">
                <Star className="size-3.5 fill-primary text-primary" strokeWidth={0} />
                {(item.ratingX10 / 10).toFixed(1)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{meta}</p>
          {feeOk ? (
            <p className="mt-0.5 text-[14px] leading-5 tabular-nums">
              <span className="font-semibold">{money(item.fromPrice, locale)}</span>
              <span className="text-muted">{t("month")}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] leading-5 text-muted">{t("feeUnknown")}</p>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          toggleCompare(item.id);
        }}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-surface/95 text-fg shadow-card ring-1 ring-border"
        aria-label={t("compare")}
      >
        <Heart className={cn("size-3.5", picked ? "fill-primary text-primary" : "")} strokeWidth={1.75} />
      </button>
    </article>
  );
}
