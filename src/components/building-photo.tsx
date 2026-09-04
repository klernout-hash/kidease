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

export function HeroPlayroom({ className }: { className?: string }) {
  return (
    <picture>
      <source type="image/avif" srcSet="/photos/playroom-1200.avif" />
      <source type="image/webp" srcSet="/photos/playroom-1200.webp" />
      <img
        src="/photos/playroom-1200.jpg"
        alt=""
        width={1200}
        height={900}
        fetchPriority="high"
        decoding="async"
        className={cn("aspect-[4/3] w-full object-cover", className)}
      />
    </picture>
  );
}
