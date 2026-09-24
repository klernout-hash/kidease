import { useRef, type TouchEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuildingPhoto, ListingPhotoFallback } from "@/components/building-photo";
import { SaveListingButton } from "@/components/save-listing-button";
import { ShareListingButton } from "@/components/share-button";
import { DETAIL_SIZES } from "@/lib/photo";
import { useCopy } from "@/lib/use-copy";

type ListingHeroBack =
  | { to: "/search" }
  | { to: "/daycare/city/$city"; city: string };

/**
 * One full-bleed frame. Photo chrome (back, share, save, count) only when a
 * real photo exists. An empty listing stays a single calm panel.
 */
export function ListingHeroGallery({
  photos,
  index,
  onIndex,
  back,
  slug,
  name,
  daycareId,
  nextPath,
  photoId,
}: {
  photos: string[];
  index: number;
  onIndex: (next: number) => void;
  back: ListingHeroBack;
  slug: string;
  name: string;
  daycareId: string;
  nextPath: string;
  photoId?: string;
}) {
  const { t } = useCopy();
  const start = useRef<{ x: number; y: number } | null>(null);
  const count = photos.length;
  const current = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const src = count ? photos[current] : "";

  function step(dir: -1 | 1) {
    if (count < 2) return;
    onIndex((current + dir + count) % count);
  }

  function onTouchStart(event: TouchEvent) {
    if ((event.target as HTMLElement).closest("a,button")) return;
    const touch = event.changedTouches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent) {
    const origin = start.current;
    start.current = null;
    if (!origin || count < 2) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  }

  const backLink =
    back.to === "/search" ? (
      <Link to="/search" className={count ? overlayControl : emptyControl} aria-label={t("backToExplore")}>
        <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
      </Link>
    ) : (
      <Link
        to="/daycare/city/$city"
        params={{ city: back.city }}
        className={count ? overlayControl : emptyControl}
        aria-label={t("backToExplore")}
      >
        <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
      </Link>
    );

  return (
    <div
      id={photoId}
      className="ke-listing-hero relative lg:overflow-hidden lg:rounded-[14px]"
      data-empty={count ? undefined : "true"}
      data-ke="listing-hero"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {src?.includes("-logo") ? (
        <img src={src} alt="" className="size-full bg-surface object-contain p-6" />
      ) : src ? (
        <BuildingPhoto
          eager
          priority
          src={src}
          sizes={DETAIL_SIZES}
          width={768}
          height={576}
          className="size-full object-cover"
        />
      ) : (
        <>
          <ListingPhotoFallback className="size-full" />
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">
            {t("photoPending")}
          </span>
        </>
      )}
      {count ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 top-1 flex items-start justify-between px-1">
            {backLink}
            <div className="flex items-center">
              <ShareListingButton appearance="photo" slug={slug} name={name} className="bg-black/40" />
              <SaveListingButton
                daycareId={daycareId}
                nextPath={nextPath}
                appearance="photo"
                framed={false}
                className="static right-auto top-auto bg-black/40"
              />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="flex items-center gap-0.5 rounded-full bg-black/55 px-1 text-white">
              {count > 1 ? (
                <button type="button" className={countControl} aria-label={t("photoPrev")} onClick={() => step(-1)}>
                  <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              <p className="min-w-10 px-1 text-center text-xs font-medium tabular-nums" data-ke="listing-photo-count" aria-live="polite">
                {current + 1}/{count}
              </p>
              {count > 1 ? (
                <button type="button" className={countControl} aria-label={t("photoNext")} onClick={() => step(1)}>
                  <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="absolute left-1 top-1">{backLink}</div>
      )}
    </div>
  );
}

const overlayControl =
  "grid size-11 place-items-center rounded-full bg-black/40 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

const countControl =
  "grid size-11 place-items-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

const emptyControl =
  "grid size-11 place-items-center rounded-full text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
