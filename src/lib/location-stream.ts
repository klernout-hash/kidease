import { encodeGeohash } from "@/lib/geohash";

export type LocationFix = {
  lat: number;
  lng: number;
  label: string;
  geohash: string;
  at: number;
};

type Handler = (fix: LocationFix) => void;

const listeners = new Set<Handler>();
let last: LocationFix | null = null;

/** In-memory location stream. Raw GPS never leaves this session. */
export function publishFix(lat: number, lng: number, label: string) {
  last = { lat, lng, label, geohash: encodeGeohash(lat, lng), at: Date.now() };
  listeners.forEach((fn) => fn(last!));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kidease-fix", { detail: last }));
  }
  return last;
}

export function lastFix() {
  return last;
}

export function subscribeFixes(fn: Handler) {
  listeners.add(fn);
  if (last) fn(last);
  return () => {
    listeners.delete(fn);
  };
}
