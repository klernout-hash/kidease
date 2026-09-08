import { useEffect, useRef, useState } from "react";
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
  "/photos/hero-480.avif 480w, /photos/hero-768.avif 768w, /photos/hero-1200.avif 1200w";
export const HERO_LCP_WEBP_SRCSET =
  "/photos/hero-480.webp 480w, /photos/hero-768.webp 768w, /photos/hero-1200.webp 1200w";
export const HERO_LCP_SIZES = HERO_SIZES;

const FALLBACK = "/photos/storefront-placeholder-480.webp";

export function BuildingPhoto({
  src,
  alt = "",
  className,
  eager = false,
  sizes = CARD_SIZES,
  width = 480,
  height = 360,
}: {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(eager);
  const [cur, setCur] = useState(src || FALLBACK);
  const [broken, setBroken] = useState(false);
  const [skipTransform, setSkipTransform] = useState(false);

  useEffect(() => {
    setBroken(false);
    setCur(src || FALLBACK);
    setSkipTransform(false);
  }, [src]);

  useEffect(() => {
    if (eager) {
      setActive(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [eager, src]);

  if (broken) {
    return <div className={cn("bg-surface-2", className)} aria-hidden="true" />;
  }

  const ready = active ? cur || FALLBACK : undefined;
  const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
  const delivered = ready ? (skipTransform ? publicPhotoUrl(ready) : photoUrl(ready, width)) : blank;

  return (
    <img
      ref={ref}
      src={delivered}
      srcSet={ready && !skipTransform ? photoSrcSet(ready, srcsetWidthsFor(width)) : undefined}
      sizes={sizes}
      width={width}
      height={height}
      alt=""
      className={cn("bg-surface-2 text-transparent", className)}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      onError={() => {
        if (ready && !skipTransform && isResizedPhotoUrl(photoUrl(ready, width))) {
          setSkipTransform(true);
          return;
        }
        if (cur !== FALLBACK) setCur(FALLBACK);
        else setBroken(true);
      }}
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
      { width: 480, avif: "/photos/hero-480.avif", webp: "/photos/hero-480.webp", jpg: "/photos/hero-1200.jpg" },
      { width: 768, avif: "/photos/hero-768.avif", webp: "/photos/hero-768.webp", jpg: "/photos/hero-1200.jpg" },
      { width: 1200, avif: "/photos/hero-1200.avif", webp: "/photos/hero-1200.webp", jpg: "/photos/hero-1200.jpg" },
    ],
    avifSrcSet: HERO_LCP_AVIF_SRCSET,
    webpSrcSet: HERO_LCP_WEBP_SRCSET,
    sizes: HERO_LCP_SIZES,
    width: 1200,
    height: 900,
  },
  "/photos/playroom.jpg": {
    variants: [
      { width: 1200, avif: "/photos/playroom-1200.avif", webp: "/photos/playroom-1200.webp", jpg: "/photos/playroom-1200.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/playroom-1200.jpg": {
    variants: [
      { width: 1200, avif: "/photos/playroom-1200.avif", webp: "/photos/playroom-1200.webp", jpg: "/photos/playroom-1200.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/cottage.jpg": {
    variants: [
      { width: 768, avif: "/photos/cottage-768.avif", webp: "/photos/cottage-768.webp", jpg: "/photos/cottage-768.jpg" },
      { width: 1200, avif: "/photos/cottage-1200.avif", webp: "/photos/cottage-1200.webp", jpg: "/photos/cottage-1200.jpg" },
    ],
    width: 1200,
    height: 900,
  },
  "/photos/kitchen.jpg": {
    variants: [
      { width: 768, avif: "/photos/kitchen-768.avif", webp: "/photos/kitchen-768.webp", jpg: "/photos/kitchen-768.jpg" },
      { width: 1200, avif: "/photos/kitchen-1200.avif", webp: "/photos/kitchen-1200.webp", jpg: "/photos/kitchen-1200.jpg" },
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
          decoding="async"
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
