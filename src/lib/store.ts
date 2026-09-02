import { create } from "zustand";
import { WINNIPEG, writeSavedOrigin } from "./geo";
import type { OriginSource } from "./presence";
import { applyDocumentLocale, LANGUAGES } from "./languages";
import type { AgeGroup, Locale } from "./types";

function readLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem("kidease-locale");
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved as Locale;
  } catch {
    /* ignore */
  }
  return "en";
}

function readLiveOnly(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem("kidease-live-only");
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return true;
}

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
};

export const useAppStore = create<SearchState>()((set) => ({
  locale: readLocale(),
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
  setRadiusKm: (radiusKm) => set({ radiusKm }),
  sort: "distance",
  setSort: (sort) => set({ sort }),
  ageGroup: "any",
  setAgeGroup: (ageGroup) => set({ ageGroup }),
  view: "map",
  setView: (view) => set({ view }),
  query: "",
  setQuery: (query) => set({ query }),
  liveOnly: readLiveOnly(),
  setLiveOnly: (liveOnly) => {
    try {
      window.localStorage.setItem("kidease-live-only", liveOnly ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ liveOnly });
  },
}));
