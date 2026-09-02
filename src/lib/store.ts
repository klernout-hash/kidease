import { create } from "zustand";
import { WINNIPEG, writeSavedOrigin } from "./geo";
import type { OriginSource } from "./presence";
import { applyDocumentLocale } from "./languages";
import type { AgeGroup, Locale } from "./types";
import { writeDistanceUnit, type DistanceUnit } from "./units";
import { writeLocationConsent, type LocationConsent } from "./location-consent";

export type SortKey = "distance" | "price" | "rating" | "availability";

type Origin = { lat: number; lng: number; label: string };

type SearchState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  origin: Origin;
  setOrigin: (origin: Origin, source?: OriginSource) => void;
  located: boolean;
  setLocated: (v: boolean) => void;
  originSource: OriginSource | null;
  originAt: number | null;
  setLiveFix: (lat: number, lng: number, label: string) => void;
  touchGps: () => void;
  radiusKm: number;
  setRadiusKm: (n: number) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  ageGroup: "any" | AgeGroup;
  setAgeGroup: (a: "any" | AgeGroup) => void;
  view: "map" | "list";
  setView: (v: "map" | "list") => void;
  query: string;
  setQuery: (q: string) => void;
  liveOnly: boolean;
  setLiveOnly: (v: boolean) => void;
  distanceUnit: DistanceUnit;
  setDistanceUnit: (unit: DistanceUnit) => void;
  locationConsent: LocationConsent;
  setLocationConsent: (v: LocationConsent) => void;
};

export const useAppStore = create<SearchState>()((set) => ({
  locale: "en",
  setLocale: (locale) => {
    try {
      window.localStorage.setItem("kidease-locale", locale);
    } catch {
      /* ignore */
    }
    applyDocumentLocale(locale);
    set({ locale });
  },
  origin: { lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label },
  setOrigin: (origin, source = "manual") => {
    writeSavedOrigin(origin);
    set({ origin, located: true, originSource: source, originAt: Date.now() });
  },
  located: false,
  setLocated: (located) => set({ located }),
  originSource: null,
  originAt: null,
  setLiveFix: (lat, lng, label) => {
    set({
      origin: { lat, lng, label },
      located: true,
      originSource: "gps",
      originAt: Date.now(),
    });
  },
  touchGps: () => set({ located: true, originSource: "gps", originAt: Date.now() }),
  radiusKm: 25,
  setRadiusKm: (n) => set({ radiusKm: Math.min(100, Math.max(1, Math.round(n))) }),
  sort: "distance",
  setSort: (sort) => set({ sort }),
  ageGroup: "any",
  setAgeGroup: (ageGroup) => set({ ageGroup }),
  view: "map",
  setView: (view) => set({ view }),
  query: "",
  setQuery: (query) => set({ query }),
  liveOnly: false,
  setLiveOnly: (liveOnly) => {
    try {
      window.localStorage.setItem("kidease-live-only", liveOnly ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ liveOnly });
  },
  distanceUnit: "km",
  setDistanceUnit: (distanceUnit) => {
    writeDistanceUnit(distanceUnit);
    set({ distanceUnit });
  },
  locationConsent: "unset",
  setLocationConsent: (locationConsent) => {
    writeLocationConsent(locationConsent);
    set({ locationConsent });
  },
}));
