import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import {
  CARD_SIZES,
  DETAIL_SIZES,
  HERO_SIZES,
  isResizedPhotoUrl,
  photoSrcSet,
  photoUrl,
  publicPhotoUrl,
  srcsetWidthsFor,
} from "@/lib/photo";
import { isMissingCatalogueBuilding } from "@/lib/catalogue-buildings";
import { healMediaUrl, isFailedPhotoUrl, isStockListingPhoto, rememberFailedPhoto } from "@/lib/listing-photo";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Mobile Lighthouse LCP: sized AVIF, not a late-discovered 1200-only file. */
export const HERO_LCP_AVIF_SRCSET =
  "/photos/hero-480-k2.avif?v=1 480w, /photos/hero-768-k2.avif?v=1 768w, /photos/hero-1200-k2.avif?v=1 1200w";
export const HERO_LCP_WEBP_SRCSET =
  "/photos/hero-480-k2.webp 480w, /photos/hero-768-k2.webp 768w, /photos/hero-1200-k2.webp 1200w";
/** Phone LCP. Caps at 768w so a 3× screen does not pull the 1200 file. */
export const HERO_LCP_MOBILE_AVIF_SRCSET =
  "/photos/hero-480-k2.avif?v=1 480w, /photos/hero-768-k2.avif?v=1 768w";
export const HERO_LCP_MOBILE_WEBP_SRCSET =
  "/photos/hero-480-k2.webp 480w, /photos/hero-768-k2.webp 768w";
export const HERO_LCP_SIZES = HERO_SIZES;
export const HERO_LCP_MOBILE_SIZES = "100vw";

function photoNeedsFallback(src: string): boolean {
  return !src || isStockListingPhoto(src) || isFailedPhotoUrl(src) || isMissingCatalogueBuilding(src);
}

/** Quiet while a real photo loads. Logo and Claim Listing only when there is no picture. */
function UnclaimedWash() {
  return (
    <>
      <div className="ke-unclaimed-wash pointer-events-none absolute inset-0" aria-hidden />
      <svg
        viewBox="0 0 640 320"
        className="ke-unclaimed-mark pointer-events-none absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <circle cx="560" cy="52" r="22" fill="currentColor" />
        <path d="M48 110V64h70v46" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M83 64v46M48 87h70" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M470 250v-72h92v72" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M458 178h116L516 136z" fill="currentColor" />
        <rect x="508" y="202" width="18" height="48" rx="1" fill="currentColor" />
        <rect x="40" y="228" width="36" height="36" rx="4" fill="currentColor" />
        <rect x="66" y="206" width="30" height="30" rx="4" fill="currentColor" />
        <rect x="88" y="240" width="24" height="24" rx="3" fill="currentColor" />
        <circle cx="598" cy="228" r="18" fill="currentColor" />
        <rect x="592" y="228" width="10" height="32" fill="currentColor" />
      </svg>
    </>
  );
}

/** Same building-outline wash as an unclaimed card photo. No text, so it stays sharp in light and dark. */
export function ListingShadowArt({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <UnclaimedWash />
    </div>
  );
}

export function ListingPhotoFallback({
  className,
  style,
  claim = false,
  claimQuery,
  quiet = false,
}: {
  className?: string;
  style?: CSSProperties;
  claim?: boolean;
  /** When set, the frame links to claim search for this centre. */
  claimQuery?: string;
  /** Flat theme fill while a real photo is still loading. Empty photos use the wash. */
  quiet?: boolean;
}) {
  const { t, locale } = useCopy();
  const showClaim = claim && !quiet;
  const mark = (
    <span className="flex max-w-full flex-col items-center gap-1.5 px-3 text-center">
      <img
        src="/logo-transparent.svg?v=17"
        alt=""
        width={56}
        height={56}
        decoding="async"
        className="h-11 w-11 object-contain [.ke-listing-hero_&]:h-16 [.ke-listing-hero_&]:w-16"
      />
      <span className="text-[13px] font-semibold leading-4 tracking-[-0.01em] text-primary">{t("claimListingFrame")}</span>
    </span>
  );
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden text-primary",
        quiet && "bg-surface-2",
        className,
      )}
      style={style}
      data-ke="photo-fallback"
      data-claim={showClaim ? "listing" : undefined}
      data-placeholder={quiet ? "loading" : "theme"}
      aria-hidden={showClaim ? undefined : true}
    >
      {quiet ? null : <UnclaimedWash />}
      {showClaim ? (
        claimQuery !== undefined ? (
          <Link
            to={localePath("/claim", locale)}
            search={claimQuery ? { q: claimQuery } : {}}
            className="text-inherit no-underline"
          >
            <span className="relative z-[1]">{mark}</span>
          </Link>
        ) : (
          <span className="relative z-[1]">{mark}</span>
        )
      ) : null}
    </div>
  );
}

export function BuildingPhoto({
  src,
  alt: _alt = "",
  className,
  eager = false,
  priority = false,
  sizes = CARD_SIZES,
  width = 480,
  height = 360,
  claim = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  /** LCP only. Eager cards stay loading=eager without stealing hero bandwidth. */
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  /** Broken or missing stills. Live listings pass false so they are not asked to claim. */
  claim?: boolean;
}) {
  const healed = healMediaUrl(src);
  const ref = useRef<HTMLImageElement>(null);
  const [cur, setCur] = useState(healed);
  const [broken, setBroken] = useState(photoNeedsFallback(healed));
  const [skipTransform, setSkipTransform] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const next = healMediaUrl(src);
    setCur(next);
    setBroken(photoNeedsFallback(next));
    setSkipTransform(false);
    setLoaded(false);
  }, [src]);

  const ready = cur;
  const delivered = ready ? (skipTransform ? publicPhotoUrl(ready) : photoUrl(ready, width)) : "";

  function fail(event?: SyntheticEvent<HTMLImageElement>) {
    const failed = event?.currentTarget?.currentSrc || event?.currentTarget?.src || delivered;
    setLoaded(false);
    if (ready && !skipTransform && isResizedPhotoUrl(failed || photoUrl(ready, width))) {
      setSkipTransform(true);
      return;
    }
    rememberFailedPhoto(ready || healed);
    setBroken(true);
  }

  useEffect(() => {
    const node = ref.current;
    if (!node || broken) return;
    if (node.complete && node.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    // Eager heroes can 404 before hydrate; onError does not replay.
    // Lazy cards often report complete + naturalWidth 0 before fetch starts,
    // so they wait for onError / onLoad instead of being marked broken.
    if ((eager || priority) && node.complete && node.naturalWidth === 0 && node.getAttribute("src")) {
      fail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, skipTransform, broken, delivered]);

  const sized =
    className?.includes("aspect-") ||
    className?.includes("size-full") ||
    className?.includes("h-full");

  if (broken) {
    return (
      <ListingPhotoFallback
        claim={claim}
        className={className}
        style={sized ? undefined : { aspectRatio: `${width} / ${height}` }}
      />
    );
  }

  return (
    <span className={cn("relative block overflow-hidden", className)}>
      {loaded ? null : <ListingPhotoFallback quiet className="absolute inset-0 size-full" />}
      <img
        ref={ref}
        src={delivered}
        srcSet={!skipTransform ? photoSrcSet(ready, srcsetWidthsFor(width)) : undefined}
        sizes={sizes}
        width={width}
        height={height}
        alt={_alt}
        aria-hidden={_alt ? undefined : true}
        data-ke-photo={loaded ? "ok" : "pending"}
        className={cn(
          "ke-photo size-full bg-surface-2 object-cover text-transparent",
          loaded ? "relative" : "invisible absolute inset-0",
        )}
        loading={priority || eager ? "eager" : "lazy"}
        decoding={priority ? "auto" : "async"}
        fetchPriority={priority ? "high" : eager ? "auto" : "low"}
        onLoad={() => setLoaded(true)}
        onError={fail}
      />
    </span>
  );
}

type FeelVariant = { width: number; avif?: string; webp?: string; jpg: string };

type FeelSource = {
  variants: FeelVariant[];
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
  width: number;
  height: number;
};

/** Pre-sized marketing stills already in /public/photos. Prefer these paths over new assets. */
const FEEL_SOURCES: Record<string, FeelSource> = {
  "/photos/hero.jpg": {
    variants: [
      { width: 480, avif: "/photos/hero-480-k2.avif", webp: "/photos/hero-480-k2.webp", jpg: "/photos/hero-1200-k2.jpg" },
      { width: 768, avif: "/photos/hero-768-k2.avif", webp: "/photos/hero-768-k2.webp", jpg: "/photos/hero-1200-k2.jpg" },
      { width: 1200, avif: "/photos/hero-1200-k2.avif", webp: "/photos/hero-1200-k2.webp", jpg: "/photos/hero-1200-k2.jpg" },
    ],
    avifSrcSet: HERO_LCP_AVIF_SRCSET,
    webpSrcSet: HERO_LCP_WEBP_SRCSET,
    sizes: HERO_LCP_SIZES,
    width: 1200,
    height: 900,
  },
  "/photos/playroom.jpg": {
    variants: [
      { width: 1200, avif: "/photos/playroom-1200-k2.avif", webp: "/photos/playroom-1200-k2.webp", jpg: "/photos/playroom-1200-k2.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/playroom-1200.jpg": {
    variants: [
      { width: 1200, avif: "/photos/playroom-1200-k2.avif", webp: "/photos/playroom-1200-k2.webp", jpg: "/photos/playroom-1200-k2.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/cottage.jpg": {
    variants: [
      { width: 768, avif: "/photos/cottage-768-k2.avif", webp: "/photos/cottage-768-k2.webp", jpg: "/photos/cottage-768-k2.jpg" },
      { width: 1200, avif: "/photos/cottage-1200-k2.avif", webp: "/photos/cottage-1200-k2.webp", jpg: "/photos/cottage-1200-k2.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/kitchen.jpg": {
    variants: [
      { width: 768, avif: "/photos/kitchen-768-k2.avif", webp: "/photos/kitchen-768-k2.webp", jpg: "/photos/kitchen-768-k2.jpg" },
      { width: 1200, avif: "/photos/kitchen-1200-k2.avif", webp: "/photos/kitchen-1200-k2.webp", jpg: "/photos/kitchen-1200-k2.jpg" },
    ],
    width: 1200,
    height: 900,
  },
};

function feelSrcSet(variants: FeelVariant[], kind: "avif" | "webp" | "jpg") {
  const parts = variants.flatMap((v) => {
    const href = v[kind];
    return href ? [`${href} ${v.width}w`] : [];
  });
  return parts.length ? parts.join(", ") : undefined;
}

export function FeelPhoto({
  src,
  className,
  eager = false,
  priority = false,
  compact = false,
  sizes,
  width,
  height,
}: {
  src: string;
  className?: string;
  eager?: boolean;
  /** LCP only. High priority, sync decode, and (with compact) no 1200 candidate. */
  priority?: boolean;
  /** Drop the 1200 still. Phone hero stays on 480/768. */
  compact?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
}) {
  const feel = FEEL_SOURCES[src];
  if (feel) {
    const variants = compact ? feel.variants.filter((variant) => variant.width <= 768) : feel.variants;
    const use = variants.length ? variants : feel.variants;
    const fallback = use[use.length - 1];
    const avif = compact
      ? HERO_LCP_MOBILE_AVIF_SRCSET
      : (feel.avifSrcSet ?? feelSrcSet(use, "avif"));
    const webp = compact
      ? HERO_LCP_MOBILE_WEBP_SRCSET
      : (feel.webpSrcSet ?? feelSrcSet(use, "webp"));
    const jpg = feelSrcSet(use, "jpg");
    const mediaSizes = sizes ?? (compact ? HERO_LCP_MOBILE_SIZES : feel.sizes);
    const high = priority || eager;
    return (
      <picture>
        {avif ? <source type="image/avif" srcSet={avif} sizes={mediaSizes} /> : null}
        {webp ? <source type="image/webp" srcSet={webp} sizes={mediaSizes} /> : null}
        <img
          src={fallback.jpg}
          srcSet={jpg && use.length > 1 && !feel.avifSrcSet && !compact ? jpg : undefined}
          sizes={mediaSizes}
          alt=""
          width={width ?? (compact ? 768 : feel.width)}
          height={height ?? (compact ? 576 : feel.height)}
          fetchPriority={priority ? "high" : eager ? "auto" : "low"}
          loading={high ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          className={cn("w-full object-cover", className)}
        />
      </picture>
    );
  }

  return (
    <BuildingPhoto
      src={src}
      className={className}
      eager={eager}
      sizes={sizes}
      width={width ?? 768}
      height={height ?? 576}
    />
  );
}

export function FeelBanner({
  src,
  className,
  photoClassName = "aspect-[16/9]",
  eager = false,
}: {
  src: string;
  className?: string;
  photoClassName?: string;
  eager?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl shadow-lift ring-1 ring-border", className)}>
      <FeelPhoto src={src} eager={eager} sizes={DETAIL_SIZES} className={cn("w-full object-cover", photoClassName)} />
    </div>
  );
}

export function HeroPlayroom({ className }: { className?: string }) {
  return (
    <FeelPhoto
      src="/photos/playroom.jpg"
      eager
      sizes={HERO_SIZES}
      className={cn("aspect-[4/3] w-full object-cover", className)}
    />
  );
}

export function HeroYard({ className }: { className?: string }) {
  return (
    <FeelPhoto
      src="/photos/hero.jpg"
      sizes={HERO_SIZES}
      className={cn("aspect-[4/3] w-full object-cover", className)}
    />
  );
}

/** Phone / app-channel LCP. Eager and capped so it does not pull hero-1200. */
export function HeroBanner({ className }: { className?: string }) {
  return (
    <FeelPhoto
      src="/photos/hero.jpg"
      priority
      compact
      sizes={HERO_LCP_MOBILE_SIZES}
      className={cn("aspect-[16/9] w-full object-cover", className)}
    />
  );
}
