import { create } from "zustand";
import { WINNIPEG, writeSavedOrigin } from "./geo";
import type { OriginSource } from "./presence";
import { applyDocumentLocale } from "./languages";
import type { AgeGroup, Locale } from "./types";
import { writeDistanceUnit, type DistanceUnit } from "./units";
import { writeLocationConsent, type LocationConsent } from "./location-consent";
import { clampRadiusKm } from "./proximity";
import { parseAnchorMode, writeDualAnchorPrefs, type AnchorMode } from "./dual-anchor";
import { applyTheme, writeThemePreference, type ResolvedTheme, type ThemePreference } from "./theme";

export type SortKey = "distance" | "price" | "rating" | "availability" | "recommended" | "match" | "urgency";

type Origin = { lat: number; lng: number; label: string };

type SearchState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  origin: Origin;
  setOrigin: (origin: Origin, source?: OriginSource) => void;
  workOrigin: Origin | null;
  setWorkOrigin: (origin: Origin | null) => void;
  anchorMode: AnchorMode;
  setAnchorMode: (mode: AnchorMode) => void;
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
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
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
  workOrigin: null,
  setWorkOrigin: (workOrigin) => {
    set((state) => {
      writeDualAnchorPrefs({ work: workOrigin, mode: state.anchorMode });
      return { workOrigin };
    });
  },
  anchorMode: "home",
  setAnchorMode: (mode) => {
    const anchorMode = parseAnchorMode(mode);
    set((state) => {
      writeDualAnchorPrefs({ work: state.workOrigin, mode: anchorMode });
      return { anchorMode };
    });
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
  setRadiusKm: (n) => set({ radiusKm: clampRadiusKm(n) }),
  sort: "distance",
  setSort: (sort) => set({ sort }),
  ageGroup: "any",
  setAgeGroup: (ageGroup) => set({ ageGroup }),
  view: "list",
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
  theme: "system",
  resolvedTheme: "light",
  setTheme: (theme) => {
    writeThemePreference(theme);
    const resolvedTheme = applyTheme(theme);
    set({ theme, resolvedTheme });
  },
}));
