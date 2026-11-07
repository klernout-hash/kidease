import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuildingPhoto } from "@/components/building-photo";
import { useCopy } from "@/lib/use-copy";

/** Named interior photos in a horizontal row. Buttons scroll; the row itself still pans. */
export function ListingRoomRail({
  photos,
  onOpen,
}: {
  photos: string[];
  onOpen: (src: string) => void;
}) {
  const { t, locale } = useCopy();
  const scroller = useRef<HTMLDivElement>(null);
  if (!photos.length) return null;
  const fr = locale === "fr";

  function move(dir: -1 | 1) {
    const port = scroller.current;
    if (!port) return;
    const card = port.querySelector<HTMLElement>("[data-ke=listing-room-card]");
    const step = card ? card.offsetWidth + 12 : Math.round(port.clientWidth * 0.8);
    port.scrollBy({ left: dir * step, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <section id="listing-photos" className="scroll-mt-24" data-ke="listing-rooms">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[1.375rem] font-semibold leading-snug">{t("interiors")}</h2>
        {photos.length > 1 ? (
          <div className="flex gap-2">
            <button type="button" className="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-border touch-manipulation" aria-label={fr ? "Salle précédente" : "Previous room"} onClick={() => move(-1)}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-border touch-manipulation" aria-label={fr ? "Salle suivante" : "Next room"} onClick={() => move(1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
      <div ref={scroller} className="ke-room-rail mt-4 flex gap-3 overflow-x-auto pb-1" tabIndex={0}>
        {photos.map((src, index) => (
          <button
            key={src}
            type="button"
            data-ke="listing-room-card"
            onClick={() => onOpen(src)}
            className="w-[min(78%,16rem)] shrink-0 text-left touch-manipulation"
            aria-label={`${t("interiors")} ${index + 1}`}
          >
            <BuildingPhoto src={src} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" width={480} height={360} />
            <span className="mt-2 block text-base font-semibold leading-6">{t("interiors")} {index + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
