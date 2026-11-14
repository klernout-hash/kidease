import type { OriginSource } from "./presence";

type NamedOrigin = { lat: number; lng: number; label: string; explicit?: boolean };
export type SearchCardOrigin = { origin: NamedOrigin; source: OriginSource | null };

function namedFiniteOrigin(origin: NamedOrigin | null | undefined): origin is NamedOrigin {
  return Boolean(
    origin && typeof origin.label === "string" && origin.label.trim() &&
    Number.isFinite(origin.lat) && Number.isFinite(origin.lng) &&
    Math.abs(origin.lat) <= 90 && Math.abs(origin.lng) <= 180 &&
    !(origin.lat === 0 && origin.lng === 0),
  );
}

/** Request-scoped presentation only. Never writes or replaces the search store. */
export function resolveSearchCardOrigin(input: {
  storedOrigin: NamedOrigin;
  storedSource: OriginSource | null;
  bootOrigin?: (NamedOrigin & { source: OriginSource }) | null;
  unknownCity?: boolean;
  needsPlace?: boolean;
}): SearchCardOrigin | null {
  if (namedFiniteOrigin(input.storedOrigin))
    return { origin: input.storedOrigin, source: input.storedSource };
  const boot = input.bootOrigin;
  if (input.unknownCity || input.needsPlace || !namedFiniteOrigin(boot)) return null;
  if (!["gps", "manual", "saved", "ip", "default"].includes(boot.source)) return null;
  return { origin: boot, source: boot.source };
}
