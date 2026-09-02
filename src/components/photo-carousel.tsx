import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuildingPhoto } from "@/components/building-photo";
import { cn } from "@/lib/utils";

export function PhotoCarousel({
  photos,
  alt = "",
  className,
  eager = false,
  aspect = "aspect-[4/3]",
}: {
  photos: string[];
  alt?: string;
  className?: string;
  eager?: boolean;
  aspect?: string;
}) {
  const shots = (photos.length ? photos : ["/photos/storefront-placeholder.jpg"]).filter(Boolean);
  const [i, setI] = useState(0);
  const src = shots[i] ?? shots[0];

  function go(delta: number) {
    setI((cur) => (cur + delta + shots.length) % shots.length);
  }

  return (
    <div className={cn("relative overflow-hidden bg-surface-2", aspect, className)}>
      {src.includes("-logo") ? (
        <img src={src} alt={alt} className="size-full object-contain bg-surface p-6" />
      ) : (
        <BuildingPhoto eager={eager} src={src} className="size-full object-cover object-center" />
      )}
      {shots.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 z-[2] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-fg shadow-card ring-1 ring-border"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 z-[2] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-fg shadow-card ring-1 ring-border"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute inset-x-0 bottom-2 z-[2] flex justify-center gap-1">
            {shots.map((_, n) => (
              <button
                key={n}
                type="button"
                aria-label={`Photo ${n + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setI(n);
                }}
                className={cn("h-1.5 rounded-full", n === i ? "w-4 bg-surface" : "w-1.5 bg-surface/55")}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
