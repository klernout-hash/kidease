import { useEffect, useRef, useState } from "react";
import { CARD_SIZES, photoSrcSet, photoUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    setBroken(false);
    setCur(src || FALLBACK);
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

  return (
    <img
      ref={ref}
      src={ready ? photoUrl(ready, width) : blank}
      srcSet={ready ? photoSrcSet(ready, [320, 480, 768]) : undefined}
      sizes={sizes}
      width={width}
      height={height}
      alt=""
      className={cn("bg-surface-2 text-transparent", className)}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      onError={() => {
        if (cur !== FALLBACK) setCur(FALLBACK);
        else setBroken(true);
      }}
    />
  );
}

/** Pre-sized marketing stills already in /public/photos. Prefer these paths over new assets. */
const FEEL_SOURCES: Record<
  string,
  { avif?: string; webp?: string; jpg: string; width: number; height: number }
> = {
  "/photos/hero.jpg": {
    avif: "/photos/hero-1200.avif",
    webp: "/photos/hero-1200.webp",
    jpg: "/photos/hero-1200.jpg",
    width: 1200,
    height: 900,
  },
  "/photos/playroom.jpg": {
    avif: "/photos/playroom-1200.avif",
    webp: "/photos/playroom-1200.webp",
    jpg: "/photos/playroom-1200.jpg",
    width: 1200,
    height: 900,
  },
  "/photos/playroom-1200.jpg": {
    avif: "/photos/playroom-1200.avif",
    webp: "/photos/playroom-1200.webp",
    jpg: "/photos/playroom-1200.jpg",
    width: 1200,
    height: 900,
  },
};

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
    return (
      <picture>
        {feel.avif ? <source type="image/avif" srcSet={feel.avif} /> : null}
        {feel.webp ? <source type="image/webp" srcSet={feel.webp} /> : null}
        <img
          src={feel.jpg}
          alt=""
          width={width ?? feel.width}
          height={height ?? feel.height}
          fetchPriority={eager ? "high" : undefined}
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
      <FeelPhoto src={src} eager={eager} className={cn("w-full object-cover", photoClassName)} />
    </div>
  );
}

export function HeroPlayroom({ className }: { className?: string }) {
  return <FeelPhoto src="/photos/playroom.jpg" eager className={cn("aspect-[4/3] w-full object-cover", className)} />;
}

export function HeroYard({ className }: { className?: string }) {
  return <FeelPhoto src="/photos/hero.jpg" eager className={cn("aspect-[4/3] w-full object-cover", className)} />;
}
