import { useRef, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Grid2X2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { HistoryBack } from "@/components/history-back";
import { BuildingPhoto, ListingPhotoFallback } from "@/components/building-photo";
import { SaveListingButton } from "@/components/save-listing-button";
import { ShareListingButton } from "@/components/share-button";
import { DETAIL_SIZES } from "@/lib/photo";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { galleryIndex, nextGalleryIndex } from "@/lib/listing-gallery";

type ListingHeroBack =
  | { to: "/search" }
  | { to: "/daycare/city/$city"; city: string };

/** Real listing photos, with a compact phone frame and a keyboard-accessible viewer. */
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
  claim = false,
  showSave = true,
  open,
  onOpenChange,
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
  /** False for a centre already live. Do not ask them to claim. */
  claim?: boolean;
  /** Parents and guests can save. Daycare accounts do not see the heart. */
  showSave?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useCopy();
  const start = useRef<{ x: number; y: number } | null>(null);
  const viewerButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const count = photos.length;
  const current = galleryIndex(index, count);
  const src = count ? photos[current] : "";

  function step(dir: -1 | 1) {
    if (count < 2) return;
    onIndex(nextGalleryIndex(current, count, dir));
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

  const backHref =
    back.to === "/search" ? localePath("/search", locale) : localePath(`/daycare/city/${back.city}`, locale);
  const backLink = (
    <HistoryBack
      fallbackHref={backHref}
      fallbackLabel={t("search")}
      fallbackAria={t("backToExplore")}
      marker="listing-back"
      className={count ? overlayControl : "text-fg"}
    />
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <div className={count > 1 ? "grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : undefined} data-ke="listing-gallery">
    <div
      id={photoId}
      className="ke-listing-hero relative overflow-hidden lg:rounded-2xl"
      data-empty={count ? undefined : "true"}
      data-claim={claim ? "offer" : undefined}
      data-ke="listing-hero"
      style={count ? { aspectRatio: "4 / 3", maxHeight: "min(28rem, 58dvh)" } : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {src ? (
        <button
          ref={viewerButton}
          type="button"
          className="absolute inset-0 size-full touch-manipulation focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary"
          aria-label={locale === "fr" ? `Voir les photos de ${name}` : `View photos of ${name}`}
          onClick={() => onOpenChange(true)}
          data-ke="listing-gallery-open"
        >
        {src.includes("-logo") ? (
          <img src={src} alt={name} className="size-full bg-surface object-contain p-6" />
        ) : (
        <BuildingPhoto
          eager
          priority
          claim={false}
          src={src}
          alt={name}
          sizes={DETAIL_SIZES}
          width={768}
          height={576}
          className="size-full object-cover"
        />
        )}
        </button>
      ) : claim ? (
        <ListingPhotoFallback plain claim claimQuery={name} className="size-full" />
      ) : (
        <ListingPhotoFallback plain className="size-full" />
      )}
      {count ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-fg/30 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 top-1 flex items-start justify-between px-1">
            {backLink}
            <div className="flex items-center">
              <ShareListingButton appearance="photo" slug={slug} name={name} className="bg-surface/95 text-fg" />
              {showSave ? (
                <SaveListingButton
                  daycareId={daycareId}
                  nextPath={nextPath}
                  appearance="photo"
                  framed={false}
                  className="static right-auto top-auto bg-surface/95 text-fg"
                />
              ) : null}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="flex items-center gap-0.5 rounded-full bg-surface/95 px-1 text-fg">
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
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="absolute bottom-3 right-3 hidden min-h-[44px] min-w-[44px] items-center gap-2 rounded-xl bg-surface px-3 text-sm font-medium text-fg shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
          >
            <Grid2X2 className="size-4" aria-hidden />
            {locale === "fr" ? "Voir les photos" : "Show all photos"}
          </button>
        </>
      ) : (
        <div className="absolute left-1 top-1">{backLink}</div>
      )}
    </div>
    {count > 1 ? (
      <div className={`hidden min-h-0 gap-2 md:grid ${count > 3 ? "grid-cols-2" : "grid-cols-1"}`} data-ke="listing-gallery-thumbnails">
        {photos.slice(1, 5).map((photo, offset) => (
          <button
            type="button"
            key={`${photo}-${offset}`}
            className="relative min-h-0 overflow-hidden rounded-2xl touch-manipulation focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary"
            aria-label={`${locale === "fr" ? "Voir la photo" : "View photo"} ${offset + 2}`}
            onClick={() => { onIndex(offset + 1); onOpenChange(true); }}
          >
            <BuildingPhoto src={photo} alt="" width={480} height={360} sizes="(min-width: 768px) 240px, 40vw" className="absolute inset-0 size-full object-cover" />
          </button>
        ))}
      </div>
    ) : null}
    </div>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-fg/70" />
      <Dialog.Content
        data-ke="listing-gallery-viewer"
        className="fixed inset-0 z-[81] flex min-h-0 flex-col bg-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-fg focus:outline-none md:inset-6 md:rounded-2xl md:p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const previous = document.activeElement;
          returnFocus.current = previous instanceof HTMLElement && previous !== document.body ? previous : viewerButton.current;
          closeButton.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current?.isConnected ? returnFocus.current : viewerButton.current;
          target?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold">{name}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted" aria-live="polite">
              {t("photoCount").replace("{n}", String(current + 1)).replace("{max}", String(count))}
            </Dialog.Description>
          </div>
          <Dialog.Close ref={closeButton} className="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-surface ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("close")}>
            <X className="size-5" aria-hidden />
          </Dialog.Close>
        </div>
        <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-2">
          {src ? <BuildingPhoto src={src} alt={`${name} · ${current + 1}`} eager width={1200} height={900} sizes="100vw" className="size-full [&_img]:object-contain" /> : null}
        </div>
        {count > 1 ? (
          <div className="mt-4 flex shrink-0 justify-center gap-3">
            <button type="button" className="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-surface ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("photoPrev")} onClick={() => step(-1)}><ChevronLeft className="size-5" aria-hidden /></button>
            <button type="button" className="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-surface ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("photoNext")} onClick={() => step(1)}><ChevronRight className="size-5" aria-hidden /></button>
          </div>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}

const overlayControl =
  "max-w-[11rem] bg-surface/95 px-1.5 pr-3 text-fg hover:bg-surface focus-visible:ring-ring";

const countControl =
  "grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
