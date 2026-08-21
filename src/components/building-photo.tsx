import { useEffect, useState } from "react";

const FALLBACK = "/photos/storefront-placeholder.jpg";

export function BuildingPhoto({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [cur, setCur] = useState(src || FALLBACK);

  useEffect(() => {
    setCur(src || FALLBACK);
  }, [src]);

  return (
    <img
      src={cur}
      alt={alt}
      className={className}
      onError={() => {
        if (cur !== FALLBACK) setCur(FALLBACK);
      }}
    />
  );
}
