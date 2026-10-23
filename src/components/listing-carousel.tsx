import { useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuildingPhoto, ListingPhotoFallback } from "@/components/building-photo";
import { isMissingCatalogueBuilding } from "@/lib/catalogue-buildings";
import { healMediaUrl, isFailedPhotoUrl, isStockListingPhoto } from "@/lib/listing-photo";
import { cn } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";

export function ListingCarousel({
  photos,
  eager = false,
  aspect = "4/3",
  className,
}: {
  photos: string[];
  eager?: boolean;
  aspect?: "4/3" | "20/19" | "1/1";
  className?: string;
}) {
  const { t } = useCopy();
  const shots = photos
    .map((p) => healMediaUrl(p))
    .filter((p) => p && !isStockListingPhoto(p) && !isMissingCatalogueBuilding(p) && !isFailedPhotoUrl(p))
    .slice(0, 12);
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  if (!shots.length) {
    return <ListingPhotoFallback claim={false} className={cn("overflow-hidden rounded-[14px]", className)} />;
  }

  function go(next: number) {
    const max = shots.length;
    setIndex(((next % max) + max) % max);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (startX.current == null || shots.length < 2) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx > 40) go(index - 1);
    else if (dx < -40) go(index + 1);
  }

  const ratio = aspect === "20/19" ? "aspect-[20/19]" : aspect === "1/1" ? "aspect-square" : "aspect-[4/3]";

  return (
    <div
      className={cn("group/photo relative overflow-hidden rounded-[14px] bg-surface-2", ratio, className)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <BuildingPhoto
        src={shots[index]}
        eager={eager}
        alt=""
        className="size-full object-cover object-center"
        width={720}
        height={aspect === "4/3" ? 540 : 720}
      />
      {shots.length > 1 ? (
        <>
          <button
            type="button"
            aria-label={t("photoPrev")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index - 1);
            }}
            className="absolute left-2 top-1/2 z-[2] grid size-11 min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#222] shadow-[0_2px_6px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={t("photoNext")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index + 1);
            }}
            className="absolute right-2 top-1/2 z-[2] grid size-11 min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#222] shadow-[0_2px_6px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-[2] flex justify-center gap-1">
            {shots.slice(0, 8).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-full bg-white",
                  i === index ? "h-1.5 w-1.5 opacity-100" : "h-1.5 w-1.5 opacity-55",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
