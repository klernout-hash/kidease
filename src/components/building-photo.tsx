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
import { cn } from "@/lib/utils";

/** Mobile Lighthouse LCP: sized AVIF, not a late-discovered 1200-only file. */
export const HERO_LCP_AVIF_SRCSET =
  "/photos/hero-480-k2.avif?v=1 480w, /photos/hero-768-k2.avif?v=1 768w, /photos/hero-1200-k2.avif?v=1 1200w";
export const HERO_LCP_WEBP_SRCSET =
  "/photos/hero-480-k2.webp 480w, /photos/hero-768-k2.webp 768w, /photos/hero-1200-k2.webp 1200w";
export const HERO_LCP_SIZES = HERO_SIZES;

const FALLBACK = "/photos/storefront-placeholder-480.webp";

/** Honest empty still — labelled elsewhere. Never dressed as a centre photo. */
export function ListingPhotoFallback({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("grid place-items-center bg-surface-2 text-muted", className)}
      style={style}
      data-ke="photo-fallback"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="size-12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 22 24 10l16 12v18H8Z" />
        <path d="M20 40V28h8v12" />
      </svg>
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
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [cur, setCur] = useState(src || FALLBACK);
  const [broken, setBroken] = useState(false);
  const [skipTransform, setSkipTransform] = useState(false);

  useEffect(() => {
    setBroken(false);
    setCur(src || FALLBACK);
    setSkipTransform(false);
  }, [src]);

  const ready = cur || FALLBACK;
  const delivered = skipTransform ? publicPhotoUrl(ready) : photoUrl(ready, width);

  function fail(event?: SyntheticEvent<HTMLImageElement>) {
    const failed = event?.currentTarget?.currentSrc || event?.currentTarget?.src || delivered;
    if (!skipTransform && isResizedPhotoUrl(failed || photoUrl(ready, width))) {
      setSkipTransform(true);
      return;
    }
    if (cur !== FALLBACK) setCur(FALLBACK);
    else setBroken(true);
  }

  useEffect(() => {
    if (!eager && !priority) return;
    const node = ref.current;
    if (!node || broken) return;
    // Eager heroes can 404 before hydrate; onError does not replay. Lazy cards
    // stay on native loading=lazy — `complete` is not a reliable "failed" bit there.
    if (node.complete && node.naturalWidth === 0 && node.getAttribute("src")) {
      fail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (broken) {
    const sized =
      className?.includes("aspect-") ||
      className?.includes("size-full") ||
      className?.includes("h-full");
    return (
      <ListingPhotoFallback
        className={className}
        style={sized ? undefined : { aspectRatio: `${width} / ${height}` }}
      />
    );
  }

  return (
    <img
      ref={ref}
      src={delivered}
      srcSet={!skipTransform ? photoSrcSet(ready, srcsetWidthsFor(width)) : undefined}
      sizes={sizes}
      width={width}
      height={height}
      alt=""
      className={cn("ke-photo bg-surface-2 text-transparent", className)}
      loading={priority || eager ? "eager" : "lazy"}
      decoding={priority ? "auto" : "async"}
      fetchPriority={priority ? "high" : eager ? "auto" : "low"}
      onError={fail}
    />
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
  sizes,
  width,
  height,
}: {
  src: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
}) {
  const feel = FEEL_SOURCES[src];
  if (feel) {
    const fallback = feel.variants[feel.variants.length - 1];
    const avif = feel.avifSrcSet ?? feelSrcSet(feel.variants, "avif");
    const webp = feel.webpSrcSet ?? feelSrcSet(feel.variants, "webp");
    const jpg = feelSrcSet(feel.variants, "jpg");
    const mediaSizes = sizes ?? feel.sizes;
    return (
      <picture>
        {avif ? <source type="image/avif" srcSet={avif} sizes={mediaSizes} /> : null}
        {webp ? <source type="image/webp" srcSet={webp} sizes={mediaSizes} /> : null}
        <img
          src={fallback.jpg}
          srcSet={jpg && feel.variants.length > 1 && !feel.avifSrcSet ? jpg : undefined}
          sizes={mediaSizes}
          alt=""
          width={width ?? feel.width}
          height={height ?? feel.height}
          fetchPriority={eager ? "high" : "auto"}
          loading={eager ? "eager" : "lazy"}
          decoding={eager ? "auto" : "async"}
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
      eager
      sizes={HERO_SIZES}
      className={cn("aspect-[4/3] w-full object-cover", className)}
    />
  );
}
