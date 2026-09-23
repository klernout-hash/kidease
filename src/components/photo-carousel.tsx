import { useEffect, useState } from "react";
import { BuildingPhoto, ListingPhotoFallback } from "@/components/building-photo";
import { healMediaUrl } from "@/lib/listing-photo";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { cn } from "@/lib/utils";

export function PhotoCarousel({
  photos,
  eager = false,
  className,
  rounded = "rounded-[14px]",
}: {
  photos: string[];
  eager?: boolean;
  className?: string;
  rounded?: string;
}) {
  const slides = photos
    .map((p) => healMediaUrl(p))
    .filter((p) => p && !p.includes("-logo") && isRealListingPhoto(p));
  const list = slides;
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [list[0]]);

  useEffect(() => {
    if (list.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % list.length), 4200);
    return () => window.clearInterval(t);
  }, [list.length]);

  if (!list.length) {
    return <ListingPhotoFallback className={cn("relative overflow-hidden", rounded, className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden bg-surface-2", rounded, className)}>
      <BuildingPhoto src={list[i]} eager={eager} className="size-full object-cover object-center" />
      {list.length > 1 ? (
        <div className="absolute inset-x-0 bottom-2 z-[1] flex justify-center gap-1">
          {list.map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Photo ${n + 1}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setI(n);
              }}
              className={n === i ? "size-1.5 rounded-full bg-surface" : "size-1.5 rounded-full bg-surface/50"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
