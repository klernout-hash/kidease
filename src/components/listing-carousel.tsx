import { useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuildingPhoto } from "@/components/building-photo";
import { cn } from "@/lib/utils";

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
  const shots = photos.length ? photos.slice(0, 12) : ["/photos/storefront-placeholder-480.webp"];
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);

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
      className={cn("group/photo relative overflow-hidden rounded-[14px] bg-[#F0EDE8]", ratio, className)}
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
            aria-label="Previous photo"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index - 1);
            }}
            className="absolute left-2 top-1/2 z-[2] hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-[#222] shadow-[0_2px_6px_rgba(0,0,0,0.18)] opacity-0 transition-opacity duration-150 group-hover/photo:opacity-100 md:grid"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(index + 1);
            }}
            className="absolute right-2 top-1/2 z-[2] hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-[#222] shadow-[0_2px_6px_rgba(0,0,0,0.18)] opacity-0 transition-opacity duration-150 group-hover/photo:opacity-100 md:grid"
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
