import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ExploreCategoryChips } from "@/components/explore-category-chips";
import { DaycareCard } from "@/components/daycare-card";
import { searchDaycares } from "@/lib/server/daycares";
import { matchCentres } from "@/lib/server/ai";
import { reverseGeocode } from "@/lib/geo";
import { originFromDeviceFix } from "@/lib/default-origin";
import { BootPending } from "@/components/boot-pending";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { bootSearchOrigin } from "@/lib/search-origin";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { fsaOf, MAX_SEARCH_RADIUS_KM } from "@/lib/proximity";
import { areaPresence, presenceFreshness } from "@/lib/presence";
import { readSearchCache, searchCacheKey, writeSearchCache } from "@/lib/search-cache";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useLivePresence } from "@/lib/use-presence";
import { trackLocation } from "@/lib/telemetry";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { useAppStore, type SortKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { cwelccKind, hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { ChipButton } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { LocationConsentCard } from "@/components/location-consent";
import { DualAnchorBar } from "@/components/dual-anchor-bar";
import { ExploreHint } from "@/components/explore-hint";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { resolveLocationQuery } from "@/components/place-search";
import {
  compactExploreSearch,
  matchesDaycareName,
  parseExploreSearchFields,
} from "@/lib/explore-search";
import { getMySearchAnchors, saveMySearchAnchors } from "@/lib/server/search-anchors";
import { resolveSearchAnchors } from "@/lib/dual-anchor";
import { kmToMi, MAX_RADIUS_MI, miToKm, type DistanceUnit } from "@/lib/units";
import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { isClaimVerified } from "@/lib/trust";
import type { DaycareCard as Card } from "@/lib/types";
import { SearchAgeGate } from "@/components/search-age-gate";
import { capturePostHogEvent } from "@/lib/posthog";
import {
  honestVacancy,
  isSearchAge,
  isSearchStart,
  searchFiltersReady,
  splitSearchResults,
  startWindowToDate,
  type SearchAge,
  type SearchStart,
} from "@/lib/now-loops";
import {
  isCareType,
  isFacilityType,
  isRailAge,
  matchesCareType,
  matchesRailAge,
  type CareType,
  type RailAge,
} from "@/lib/care-type";
import {
  EXPLORE_CATEGORY_COPY,
  countExploreCategories,
  isExploreCategory,
  listingMatchesExploreFilter,
  resolvedExploreCategory,
  type ExploreCategory,
} from "@/lib/explore-categories";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { noteHappyMoment } from "@/lib/store-review";
import { saveSearch } from "@/lib/server/saved-searches";
import {
  defaultSearchName,
  takeSavedSearchToApply,
  type AgeBand,
  type SavedSearchFilters,
} from "@/lib/saved-search";
import { CityHubLinks } from "@/components/city-hub-links";
import { dismissPopovers } from "@/lib/dismiss-popovers";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";

const MapView = lazy(() => import("@/components/map-view").then((m) => ({ default: m.MapView })));
const CompareBar = lazy(() =>
  import("@/components/compare-bar").then((m) => ({ default: m.CompareBar })),
);

export const Route = createFileRoute("/search")({
  loader: async () => {
    const origin = await resolveRequestSearchOrigin();
    const items = await withTimeoutFallback(
      searchDaycares({
        data: {
          lat: origin.lat,
          lng: origin.lng,
          radiusKm: 25,
          sort: "distance",
          ageGroup: "any",
        },
      }),
      LOADER_SETTLE_MS,
      [] as Card[],
    );
    return { items, origin };
  },
  pendingMs: 200,
  pendingComponent: BootPending,
  validateSearch: (s: Record<string, unknown>) => {
    const fields = parseExploreSearchFields(s);
    const out: {
      q?: string;
      name?: string;
      from?: string;
      to?: string;
      sort?: SortKey;
      age?: RailAge;
      start?: SearchStart;
      cat?: ExploreCategory;
      care?: CareType;
      favorites?: "1";
    } = { ...fields };
    const sort = typeof s.sort === "string" ? s.sort : "";
    if (
      ["distance", "price", "rating", "availability", "recommended", "match", "urgency"].includes(
        sort,
      )
    ) {
      out.sort = sort as SortKey;
    }
    if (typeof s.age === "string" && isRailAge(s.age)) out.age = s.age;
    if (typeof s.start === "string" && isSearchStart(s.start)) out.start = s.start;
    if (typeof s.cat === "string" && isExploreCategory(s.cat)) out.cat = s.cat;
    if (typeof s.care === "string" && isCareType(s.care)) out.care = s.care;
    else if (typeof s.facility === "string" && isFacilityType(s.facility)) out.care = s.facility;
    if (s.favorites === "1" || s.favorites === true) out.favorites = "1";
    return out;
  },
  head: () => pageSeoHead(MARKETING_PAGE_SEO.search),
  component: SearchPage,
});

const PRESETS_KM = [1, 5, 10, 15, 25, 40, 50];
const PRESETS_MI = [1, 3, 5, 10, 15, 25, 31];
const DOT = " \u00b7 ";

function unitLabel(unit: DistanceUnit, t: (k: "km" | "mi") => string) {
  return unit === "mi" ? t("mi") : t("km");
}

function SearchPage() {
  const { t } = useCopy();
  const { user } = useCurrentUserState();
  const navigate = useNavigate({ from: "/search" });
  const incoming = Route.useSearch();
  const boot = Route.useLoaderData();
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const workOrigin = useAppStore((s) => s.workOrigin);
  const setWorkOrigin = useAppStore((s) => s.setWorkOrigin);
  const anchorMode = useAppStore((s) => s.anchorMode);
  const setAnchorMode = useAppStore((s) => s.setAnchorMode);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setRadiusKm = useAppStore((s) => s.setRadiusKm);
  const sort = useAppStore((s) => s.sort);
  const setSort = useAppStore((s) => s.setSort);
  const ageGroup = useAppStore((s) => s.ageGroup);
  const setAgeGroup = useAppStore((s) => s.setAgeGroup);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const [items, setItems] = useState<Card[] | null>(boot.items.length > 0 ? boot.items : null);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);
  const [need, setNeed] = useState("");
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [avail, setAvail] = useState<"any" | "open" | "waitlist" | "unknown">("any");
  const [ten, setTen] = useState(false);
  const [meals, setMeals] = useState(false);
  const [outdoor, setOutdoor] = useState(false);
  const [inclusive, setInclusive] = useState(false);
  const [extended, setExtended] = useState(false);
  const [infantOnly, setInfantOnly] = useState(false);
  const [catchmentOnly, setCatchmentOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [claimVerifiedOnly, setClaimVerifiedOnly] = useState(false);
  const [needBy, setNeedBy] = useState(incoming.from ?? "");
  const [needUntil, setNeedUntil] = useState(incoming.to ?? "");
  const [nameQuery, setNameQuery] = useState(incoming.name ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [careType, setCareType] = useState<CareType | "any">("any");
  const [schoolAgeOnly, setSchoolAgeOnly] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [workQuery, setWorkQuery] = useState("");
  const [anchorsHydrated, setAnchorsHydrated] = useState(false);
  const originAt = useAppStore((s) => s.originAt);
  const originSource = useAppStore((s) => s.originSource);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const setDistanceUnit = useAppStore((s) => s.setDistanceUnit);
  const locationConsent = useAppStore((s) => s.locationConsent);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);
  const [askLocation, setAskLocation] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  useLivePresence(locationConsent === "granted");

  useEffect(() => {
    if (view === "map") setMapEnabled(true);
  }, [view]);

  useEffect(() => {
    void bootSearchOrigin(incoming.q, boot.origin);
  }, [incoming.q, boot.origin]);

  useEffect(() => {
    if (incoming.sort) setSort(incoming.sort);
    const cat = resolvedExploreCategory(incoming);
    const ageGate = (cat && isRailAge(cat) ? cat : incoming.age) as RailAge | undefined;
    if (ageGate === "school-age") {
      setSchoolAgeOnly(true);
      setAgeGroup("any");
    } else if (ageGate) {
      setSchoolAgeOnly(false);
      setAgeGroup(ageGate);
    } else if (incoming.cat) {
      setSchoolAgeOnly(false);
      setAgeGroup("any");
    }
    if (incoming.care) setCareType(incoming.care);
    if (incoming.favorites === "1") setFavoritesOnly(true);
    if (incoming.start === "now" || incoming.start === "this-month" || incoming.start === "next-month") {
      setNeedBy(startWindowToDate(incoming.start));
    }
  }, [incoming.sort, incoming.age, incoming.cat, incoming.care, incoming.favorites, incoming.start, setSort, setAgeGroup]);

  useEffect(() => {
    setNameQuery(incoming.name ?? "");
  }, [incoming.name]);

  useEffect(() => {
    setNeedBy(incoming.from ?? "");
    setNeedUntil(incoming.to ?? "");
  }, [incoming.from, incoming.to]);

  useEffect(() => {
    const saved = takeSavedSearchToApply();
    if (!saved) return;
    setOrigin({ lat: saved.centerLat, lng: saved.centerLng, label: saved.centerLabel });
    setRadiusKm(saved.radiusKm);
    setAgeGroup(saved.ageBand === "any" ? "any" : saved.ageBand);
    setQuery(saved.centerLabel);
    setLiveOnly(saved.filters.liveOnly);
    setAvail(saved.filters.avail);
    setTen(saved.filters.ten);
    setMeals(saved.filters.meals);
    setOutdoor(saved.filters.outdoor);
    setInclusive(saved.filters.inclusive);
    setExtended(saved.filters.extended);
    setInfantOnly(saved.filters.infantOnly);
    setCatchmentOnly(saved.filters.catchmentOnly);
    setConfirmedOnly(saved.filters.confirmedOnly);
    setReadyOnly(saved.filters.readyOnly);
    setClaimVerifiedOnly(saved.filters.claimVerifiedOnly);
    setFilters(true);
  }, [setOrigin, setRadiusKm, setAgeGroup, setQuery, setLiveOnly]);

  useEffect(() => {
    if (radiusKm > MAX_SEARCH_RADIUS_KM) setRadiusKm(MAX_SEARCH_RADIUS_KM);
  }, [radiusKm, setRadiusKm]);

  useEffect(() => {
    if (workOrigin?.label && !workQuery) setWorkQuery(workOrigin.label);
  }, [workOrigin?.label, workQuery]);

  useEffect(() => {
    if (!user) {
      setAnchorsHydrated(true);
      return;
    }
    let live = true;
    void getMySearchAnchors()
      .then((saved) => {
        if (!live) return;
        const localWork = useAppStore.getState().workOrigin;
        if (saved.work && !localWork) {
          setWorkOrigin(saved.work);
          setWorkQuery(saved.work.label);
        }
        if (saved.mode !== "home" && useAppStore.getState().anchorMode === "home") {
          setAnchorMode(saved.mode);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setAnchorsHydrated(true);
      });
    return () => {
      live = false;
    };
  }, [user?.id, setWorkOrigin, setAnchorMode]);

  useEffect(() => {
    if (!user || !anchorsHydrated) return;
    const tmr = window.setTimeout(() => {
      void saveMySearchAnchors({
        data: { home: origin, work: workOrigin, mode: anchorMode },
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(tmr);
  }, [
    user?.id,
    anchorsHydrated,
    origin.lat,
    origin.lng,
    origin.label,
    workOrigin?.lat,
    workOrigin?.lng,
    workOrigin?.label,
    anchorMode,
  ]);

  const searchData = {
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
    sort,
    ageGroup,
    fsa: fsaOf(query) || fsaOf(origin.label),
    startDate: needBy || null,
    lat2: workOrigin?.lat,
    lng2: workOrigin?.lng,
    mode: anchorMode,
  };
  const cacheInput = {
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
    sort,
    ageGroup,
    startDate: needBy || null,
    lat2: workOrigin?.lat,
    lng2: workOrigin?.lng,
    mode: anchorMode,
  };

  useEffect(() => {
    let live = true;
    const key = searchCacheKey(cacheInput);
    const cached = readSearchCache(key);
    if (cached) {
      setItems(cached);
      setSearchFailed(false);
    } else {
      setRefreshing(true);
      setSearchFailed(false);
    }
    const tmr = window.setTimeout(() => {
      void searchDaycares({
        data: searchData,
      })
        .then((rows) => {
          if (!live) return;
          setItems(rows);
          setSearchFailed(false);
          writeSearchCache(key, rows);
          captureMarketplaceFunnel({ step: "search", source: "search", dest_path: "/search" });
        })
        .catch(() => {
          if (live && !cached) {
            setItems([]);
            setSearchFailed(true);
          }
        })
        .finally(() => {
          if (live) setRefreshing(false);
        });
    }, 160);
    const watchdog = window.setTimeout(() => {
      if (!live) return;
      setItems((cur) => {
        if (cur) return cur;
        setSearchFailed(true);
        return [];
      });
      setRefreshing(false);
    }, 12_000);
    trackLocation("search", origin.lat, origin.lng, origin.label, { radiusKm });
    return () => {
      live = false;
      window.clearTimeout(tmr);
      window.clearTimeout(watchdog);
    };
  }, [
    origin.lat,
    origin.lng,
    radiusKm,
    sort,
    ageGroup,
    query,
    origin.label,
    needBy,
    workOrigin?.lat,
    workOrigin?.lng,
    anchorMode,
  ]);

  function applyPlace(place: { lat: number; lng: number; label: string }) {
    setOrigin(place);
    setQuery(place.label);
  }

  function writeExploreSearch(next: { q?: string; name?: string; from?: string; to?: string }) {
    const fields = compactExploreSearch(next);
    void navigate({
      search: {
        q: fields.q,
        name: fields.name,
        from: fields.from,
        to: fields.to,
        sort: incoming.sort,
        age: incoming.age,
        start: incoming.start,
        cat: incoming.cat,
        care: incoming.care,
        favorites: incoming.favorites,
      },
    });
  }

  function writeNowLoopSearch(next: { age?: SearchAge; start?: SearchStart }) {
    const age = next.age ?? incoming.age;
    const start = next.start ?? incoming.start;
    const keepFacilityCat =
      incoming.cat === "home" || incoming.cat === "nursery" || incoming.cat === "before-after";
    const cat = keepFacilityCat
      ? incoming.cat
      : next.age && isExploreCategory(next.age)
        ? next.age
        : incoming.cat;
    void navigate({
      search: {
        q: incoming.q ?? query,
        name: incoming.name,
        from: incoming.from,
        to: incoming.to,
        sort: incoming.sort,
        age,
        start,
        cat,
        care: incoming.care,
        favorites: incoming.favorites,
      },
    });
  }

  /** Age chips 1–4 also write `?age=` for the age-first gate. Preserve start + place. */
  function writeCategorySearch(cat?: ExploreCategory) {
    const age = cat && isRailAge(cat) ? cat : incoming.age;
    void navigate({
      search: {
        q: incoming.q ?? query,
        name: incoming.name,
        from: incoming.from,
        to: incoming.to,
        sort: incoming.sort,
        cat,
        age,
        start: incoming.start,
        favorites: incoming.favorites,
      },
    });
  }

  async function applyQuery() {
    const label = query.trim();
    let nextQ = label;
    if (label) {
      const hit = await resolveLocationQuery(label);
      if (hit) {
        applyPlace(hit);
        nextQ = hit.label;
      }
    }
    writeExploreSearch({ q: nextQ, name: nameQuery, from: needBy, to: needUntil });
  }

  async function geo() {
    if (locationConsent !== "granted") {
      setAskLocation(true);
      return;
    }
    const pos = await getDeviceLocation({ precise: true });
    if (pos) {
      const resolved = originFromDeviceFix(pos, origin);
      const label = resolved.source === "gps" ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
      setOrigin({ lat: resolved.lat, lng: resolved.lng, label }, resolved.source);
      void hapticLight();
    } else {
      setLocationConsent("denied");
    }
  }

  async function allowLocation() {
    setAskLocation(false);
    const pos = await getDeviceLocation({ precise: true });
    if (pos) {
      setLocationConsent("granted");
      const resolved = originFromDeviceFix(pos, origin);
      const label = resolved.source === "gps" ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
      setOrigin({ lat: resolved.lat, lng: resolved.lng, label }, resolved.source);
      void hapticLight();
    } else {
      setLocationConsent("denied");
    }
  }

  function clearListingFilters() {
    setAvail("any");
    setTen(false);
    setMeals(false);
    setOutdoor(false);
    setInclusive(false);
    setExtended(false);
    setInfantOnly(false);
    setCatchmentOnly(false);
    setConfirmedOnly(false);
    setReadyOnly(false);
    setClaimVerifiedOnly(false);
    setLiveOnly(false);
    setAgeGroup("any");
    setFavoritesOnly(false);
    setCareType("any");
    setSchoolAgeOnly(false);
    writeCategorySearch(undefined);
  }

  function currentFilters(): SavedSearchFilters {
    return {
      avail,
      liveOnly,
      ten,
      meals,
      outdoor,
      inclusive,
      extended,
      infantOnly,
      catchmentOnly,
      confirmedOnly,
      readyOnly,
      claimVerifiedOnly,
    };
  }

  function openSaveSearch() {
    const band: AgeBand = ageGroup === "any" ? "any" : ageGroup;
    setSaveName(defaultSearchName(origin.label, radiusKm, band));
    setSaveOpen(true);
  }

  function submitSaveSearch() {
    if (!user) return;
    setSaveBusy(true);
    const band: AgeBand = ageGroup === "any" ? "any" : ageGroup;
    void saveSearch({
      data: {
        name: saveName,
        centerLat: origin.lat,
        centerLng: origin.lng,
        centerLabel: origin.label,
        radiusKm,
        ageBand: band,
        filters: currentFilters(),
      },
    })
      .then(() => {
        toast.success(t("saveSearchSaved"));
        setSaveOpen(false);
        noteHappyMoment("saved_search");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("saveSearch")))
      .finally(() => setSaveBusy(false));
  }

  function widenSearchRadius() {
    const current = distanceUnit === "mi" ? Math.round(kmToMi(radiusKm)) : radiusKm;
    const next =
      (distanceUnit === "mi" ? PRESETS_MI : PRESETS_KM).find((n) => n > current) ??
      (distanceUnit === "mi" ? MAX_RADIUS_MI : MAX_SEARCH_RADIUS_KM);
    setRadiusKm(distanceUnit === "mi" ? miToKm(next) : next);
  }

  function retrySearch() {
    setItems(null);
    setSearchFailed(false);
    setRefreshing(true);
    void searchDaycares({
      data: searchData,
    })
      .then((rows) => {
        setItems(rows);
        setSearchFailed(false);
        writeSearchCache(searchCacheKey(cacheInput), rows);
      })
      .catch(() => {
        setItems([]);
        setSearchFailed(true);
      })
      .finally(() => setRefreshing(false));
  }

  async function runMatch() {
    setMatchBusy(true);
    setMatchNote(null);
    try {
      const res = await matchCentres({ data: need });
      if (!res.ok) {
        setMatchNote(t("aiUnavailable"));
        return;
      }
      setMatchNote(res.note);
      if (res.picks[0]) {
        setActive(res.picks[0].slug);
        const first = items?.find((i) => res.picks.some((p) => p.slug === i.slug));
        if (first) setOrigin({ lat: first.lat, lng: first.lng, label: first.city });
      }
    } catch {
      setMatchNote(t("aiUnavailable"));
    } finally {
      setMatchBusy(false);
    }
  }

  const list = useMemo(() => {
    let rows = items ?? [];
    if (liveOnly) rows = rows.filter((r) => r.live);
    if (avail === "open") rows = rows.filter((r) => honestVacancy(r).kind === "open");
    if (avail === "waitlist") rows = rows.filter((r) => honestVacancy(r).kind === "waitlist");
    if (avail === "unknown") rows = rows.filter((r) => !r.availabilityKnown);
    if (ten)
      rows = rows.filter(
        (r) =>
          cwelccKind(r.province) !== "ask" ||
          hasAmenity(r.amenities, "ten-a-day") ||
          hasAmenity(r.amenities, "funded"),
      );
    if (meals) rows = rows.filter((r) => hasAmenity(r.amenities, "meals"));
    if (outdoor)
      rows = rows.filter(
        (r) => hasAmenity(r.amenities, "outdoor") || hasAmenity(r.amenities, "yard"),
      );
    if (inclusive) rows = rows.filter((r) => hasAmenity(r.amenities, "inclusive"));
    if (extended) rows = rows.filter((r) => staysLate(r.hours, r.amenities) || opensEarly(r.hours));
    if (infantOnly) rows = rows.filter((r) => r.agesKnown && r.ageMinMonths <= 18);
    if (catchmentOnly) rows = rows.filter((r) => r.inCatchment);
    if (confirmedOnly)
      rows = rows.filter((r) => vacancyFreshness(vacancyTimestamp(r)).kind === "fresh");
    if (readyOnly) rows = rows.filter((r) => r.detailsReady === true);
    if (claimVerifiedOnly) rows = rows.filter((r) => isClaimVerified(r));
    if (favoritesOnly) rows = rows.filter((r) => r.guestFavorite === true);
    if (careType !== "any") rows = rows.filter((r) => matchesCareType(r, careType));
    if (schoolAgeOnly) rows = rows.filter((r) => matchesRailAge(r, "school-age"));
    const cat = isExploreCategory(incoming.cat) ? incoming.cat : undefined;
    if (cat) rows = rows.filter((r) => listingMatchesExploreFilter(r, cat));
    if (nameQuery.trim()) rows = rows.filter((r) => matchesDaycareName(r, nameQuery));
    return rows;
  }, [
    items,
    liveOnly,
    avail,
    ten,
    meals,
    outdoor,
    inclusive,
    extended,
    infantOnly,
    catchmentOnly,
    confirmedOnly,
    readyOnly,
    claimVerifiedOnly,
    favoritesOnly,
    careType,
    schoolAgeOnly,
    incoming.cat,
    incoming.age,
    incoming.care,
    nameQuery,
  ]);
  const searchAge = isSearchAge(incoming.age)
    ? incoming.age
    : isSearchAge(incoming.cat)
      ? incoming.cat
      : undefined;
  const searchStart = isSearchStart(incoming.start) ? incoming.start : undefined;
  const gated = searchFiltersReady(searchAge, searchStart, {
    q: incoming.q ?? query,
    label: origin.label,
    located,
  });
  const split = useMemo(() => {
    if (!gated || !searchAge || !searchStart) return { primary: [] as Card[], ageUnknown: [] as Card[] };
    return splitSearchResults(list, searchAge, searchStart);
  }, [gated, list, searchAge, searchStart]);
  const shownList = gated ? split.primary : [];
  const resultCount = gated ? shownList.length + split.ageUnknown.length : 0;
  const showSearchEmpty = gated && shownList.length === 0 && split.ageUnknown.length === 0;
  const [ageUnknownOpen, setAgeUnknownOpen] = useState(false);
  useEffect(() => {
    if (gated && shownList.length === 0 && split.ageUnknown.length > 0) {
      setAgeUnknownOpen(true);
    }
  }, [gated, shownList.length, split.ageUnknown.length]);
  useEffect(() => {
    if (!gated || !searchAge || !searchStart) return;
    capturePostHogEvent("search_filters_applied", {
      age_band: searchAge,
      start: searchStart,
      has_place: Boolean((incoming.q || query || origin.label || "").trim()),
    });
  }, [gated, searchAge, searchStart, incoming.q, query, origin.label]);
  useEffect(() => {
    if (!gated || items === null) return;
    capturePostHogEvent("search_results_shown", {
      n: resultCount,
      n_age_known: shownList.length,
      n_age_unknown: split.ageUnknown.length,
    });
  }, [gated, items, shownList.length, split.ageUnknown.length, resultCount]);
  const extraFilters =
    (avail !== "any" ? 1 : 0) +
    (ten ? 1 : 0) +
    (meals ? 1 : 0) +
    (outdoor ? 1 : 0) +
    (inclusive ? 1 : 0) +
    (extended ? 1 : 0) +
    (infantOnly ? 1 : 0) +
    (catchmentOnly ? 1 : 0) +
    (confirmedOnly ? 1 : 0) +
    (readyOnly ? 1 : 0) +
    (claimVerifiedOnly ? 1 : 0) +
    (ageGroup !== "any" ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (careType !== "any" ? 1 : 0) +
    (schoolAgeOnly ? 1 : 0) +
    (resolvedExploreCategory(incoming) ? 1 : 0);
  const anchors = resolveSearchAnchors({ home: origin, work: workOrigin, mode: anchorMode });
  const dualEmpty = anchors.intersect && !searchFailed && (items?.length ?? 0) === 0;
  const emptyState = searchFailed
    ? {
        title: t("searchFailedTitle"),
        body: t("searchFailedLead"),
        action: t("tryAgain"),
        onAction: retrySearch,
        secondary: t("changeLocation"),
        secondaryTo: "/?change=1",
      }
    : nameQuery.trim() && (items?.length ?? 0) > 0
      ? {
          title: t("noNameResults"),
          body: undefined as string | undefined,
          action: t("clearNameSearch"),
          onAction: () => {
            setNameQuery("");
            writeExploreSearch({ q: query, name: "", from: needBy, to: needUntil });
          },
          secondary: undefined as string | undefined,
          secondaryTo: undefined as string | undefined,
          onSecondary: undefined as (() => void) | undefined,
        }
      : extraFilters && (items?.length ?? 0) > 0 && resolvedExploreCategory(incoming)
        ? {
            title: t("noFacilityTypeResults").replace(
              "{type}",
              t(EXPLORE_CATEGORY_COPY[resolvedExploreCategory(incoming)!]).toLowerCase(),
            ),
            body: t("noFacilityTypeResultsLead").replace(
              "{type}",
              t(EXPLORE_CATEGORY_COPY[resolvedExploreCategory(incoming)!]).toLowerCase(),
            ),
            action: t("showAll"),
            onAction: () => writeCategorySearch(undefined),
            secondary: t("clearFilters"),
            secondaryTo: undefined as string | undefined,
            onSecondary: clearListingFilters,
          }
      : extraFilters && (items?.length ?? 0) > 0
        ? {
            title: t("noFilterResults"),
            body: t("noFilterResultsLead") as string | undefined,
            action: t("clearFilters"),
            onAction: clearListingFilters,
            secondary: t("showAll"),
            secondaryTo: undefined as string | undefined,
            onSecondary: () => setLiveOnly(false),
          }
        : liveOnly && (items?.length ?? 0) > 0
          ? {
              title: t("noLiveResults"),
              body: t("noLiveResultsLead") as string | undefined,
              action: t("showAll"),
              onAction: () => setLiveOnly(false),
              secondary: t("noLiveResultsClaim"),
              onSecondary: undefined as (() => void) | undefined,
              secondaryTo: "/claim",
            }
          : dualEmpty
            ? {
                title: t("noDualResults"),
                body: t("noDualResultsBody"),
                action: t("anchorHome"),
                onAction: () => setAnchorMode("home"),
                secondary: t("anchorWork"),
                onSecondary: () => setAnchorMode("work"),
                secondaryTo: undefined as string | undefined,
              }
            : {
                title: view === "map" ? t("emptyMap") : t("noResults"),
                body: t("noResultsLead"),
                action: t("widenRadius"),
                onAction: widenSearchRadius,
                secondary: t("changeLocation"),
                secondaryTo: "/?change=1",
                onSecondary: undefined as (() => void) | undefined,
              };
  const city =
    anchors.mode === "both" && workOrigin
      ? `${origin.label.split(",")[0]} + ${workOrigin.label.split(",")[0]}`
      : (anchors.mode === "work" && workOrigin ? workOrigin : origin).label.split(",")[0];
  const catalog = items ?? [];
  const fabric = areaPresence(catalog);
  const freshness = presenceFreshness(originAt, originSource);
  const mapOrigin = anchors.primary;

  function chip(on: boolean, label: string, action: () => void) {
    return (
      <ChipButton on={on} onClick={action} aria-pressed={on}>
        {label}
      </ChipButton>
    );
  }

  const shownRadius = distanceUnit === "mi" ? Math.round(kmToMi(radiusKm)) : radiusKm;
  const radiusMax = distanceUnit === "mi" ? MAX_RADIUS_MI : MAX_SEARCH_RADIUS_KM;
  const presets = distanceUnit === "mi" ? PRESETS_MI : PRESETS_KM;
  const u = unitLabel(distanceUnit, t);

  const radiusSlider = (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{t("radius")}</span>
        <span className="tabular-nums font-semibold">
          {shownRadius} {u}
        </span>
      </div>
      <div className="mb-3 flex h-11 overflow-hidden rounded-full bg-bg ring-1 ring-border">
        <button
          type="button"
          onClick={() => setDistanceUnit("km")}
          className={cn(
            "flex-1 text-sm font-semibold",
            distanceUnit === "km" ? "bg-fg text-bg" : "text-muted",
          )}
        >
          {t("unitsKm")}
        </button>
        <button
          type="button"
          onClick={() => setDistanceUnit("mi")}
          className={cn(
            "flex-1 text-sm font-semibold",
            distanceUnit === "mi" ? "bg-fg text-bg" : "text-muted",
          )}
        >
          {t("unitsMi")}
        </button>
      </div>
      <input
        type="range"
        min={1}
        max={radiusMax}
        step={1}
        value={shownRadius}
        onChange={(e) => {
          const n = Number(e.target.value);
          setRadiusKm(distanceUnit === "mi" ? miToKm(n) : n);
        }}
        className="w-full accent-primary"
        aria-valuemin={1}
        aria-valuemax={radiusMax}
        aria-valuenow={shownRadius}
        aria-label={`${t("radius")} ${shownRadius} ${u}`}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>1 {u}</span>
        <span>
          {radiusMax} {u}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((n) => {
          const current = distanceUnit === "mi" ? Math.round(kmToMi(radiusKm)) : radiusKm;
          return (
            <ChipButton
              key={n}
              on={current === n}
              onClick={() => setRadiusKm(distanceUnit === "mi" ? miToKm(n) : n)}
              aria-pressed={current === n}
            >
              {n} {u}
            </ChipButton>
          );
        })}
      </div>
    </div>
  );

  const filterChips = (
    <div className="flex flex-wrap gap-2">
      {chip(avail === "open", t("filterOpen"), () =>
        setAvail((v) => (v === "open" ? "any" : "open")),
      )}
      {chip(avail === "waitlist", t("filterWaitlist"), () =>
        setAvail((v) => (v === "waitlist" ? "any" : "waitlist")),
      )}
      {chip(avail === "unknown", t("filterUnknown"), () =>
        setAvail((v) => (v === "unknown" ? "any" : "unknown")),
      )}
      {chip(confirmedOnly, t("filterConfirmedSpots"), () => setConfirmedOnly((v) => !v))}
      {chip(readyOnly, t("filterDetailsReady"), () => setReadyOnly((v) => !v))}
      {chip(claimVerifiedOnly, t("filterClaimVerified"), () => setClaimVerifiedOnly((v) => !v))}
      {chip(ten, t("filterTen"), () => setTen((v) => !v))}
      {chip(meals, t("filterMeals"), () => setMeals((v) => !v))}
      {chip(outdoor, t("filterOutdoor"), () => setOutdoor((v) => !v))}
      {chip(inclusive, t("filterInclusive"), () => setInclusive((v) => !v))}
      {chip(extended, t("filterExtended"), () => setExtended((v) => !v))}
      {chip(infantOnly, t("filterInfant"), () => setInfantOnly((v) => !v))}
      {chip(catchmentOnly, t("filterCatchment"), () => setCatchmentOnly((v) => !v))}
      {chip(favoritesOnly, t("filterFavorites"), () => setFavoritesOnly((v) => !v))}
      {chip(resolvedExploreCategory(incoming) === "before-after", t("filterCareBeforeAfter"), () =>
        writeCategorySearch(
          resolvedExploreCategory(incoming) === "before-after" ? undefined : "before-after",
        ),
      )}
    </div>
  );

  const exploreCatCounts = countExploreCategories(catalog);
  const activeCat = resolvedExploreCategory(incoming);

  return (
    <Shell>
      <div className="ke-gutter mx-auto max-w-7xl pb-10 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.65rem] leading-tight tracking-[-0.03em]">{city}</h1>
            <p className="mt-0.5 min-h-5 truncate text-sm text-muted" aria-live="polite">
              {items === null ? (
                <span className="inline-flex items-center gap-2">
                  <span className="ke-skel inline-block h-3.5 w-28" aria-hidden="true" />
                  <span>{t("searchCountLoading")}</span>
                </span>
              ) : (
                <>
                  {liveOnly
                    ? (fabric.live > 0 ? t("searchLiveCount") : t("searchLiveEmptyCount"))
                        .replace("{live}", String(fabric.live))
                        .replace("{n}", String(catalog.length))
                    : !gated
                      ? t("searchNeedAgeStart")
                    : resultCount === 1
                      ? t("searchResultCountOne")
                      : t("searchResultCount").replace("{n}", String(resultCount))}
                  {DOT}
                  {shownRadius} {u}
                  {DOT}
                  {freshness === "live" ? t("presenceLive") : freshness === "fresh" ? t("presenceFresh") : t("presenceStale")}
                </>
              )}
            </p>
            <p
              className={cn(
                "mt-1 min-h-4 truncate text-xs font-medium",
                items !== null && fabric.live > 0 ? "text-ok" : "text-muted",
              )}
            >
              {items !== null && fabric.live > 0
                ? t("liveInArea").replace("{n}", String(fabric.live))
                : catalog.length > 0
                  ? t("liveVsAllNone").replace("{n}", String(catalog.length))
                  : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              to="/"
              search={{ change: "1" }}
              className="pb-0.5 text-sm font-medium text-primary"
            >
              {t("changeLocation")}
            </Link>
            {user ? (
              <>
                <Link to="/parent" search={{ tab: "children" }} className="text-sm font-medium text-primary">
                  {t("wayfindChildProfile")}
                </Link>
                <button type="button" onClick={openSaveSearch} className="text-sm font-medium text-primary">
                  {t("saveSearch")}
                </button>
              </>
            ) : (
              <Link to="/login" search={parentLoginSearch("/search")} className="text-sm font-medium text-primary">
                {t("saveSearchNeedSignIn")}
              </Link>
            )}
          </div>
        </div>

        <CityHubLinks className="mt-3" />

        {saveOpen ? (
          <div className="mt-3 rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="text-sm font-semibold">{t("saveSearch")}</p>
            <p className="mt-1 text-sm text-muted">{t("saveSearchLead")}</p>
            <label className="mt-3 block text-sm">
              <span className="font-medium">{t("saveSearchName")}</span>
              <input
                className="ke-input mt-1 w-full"
                value={saveName}
                maxLength={80}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </label>
            <p className="mt-2 text-xs text-subtle">
              {origin.label} · {shownRadius} {u} · {ageGroup === "any" ? t("anyAge") : t(ageGroup)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saveBusy || !saveName.trim()}
                onClick={submitSaveSearch}
              >
                {t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setSaveOpen(false)}
              >
                {t("close")}
              </Button>
            </div>
          </div>
        ) : null}

        <ExploreSearchBar
          className="mt-4"
          values={{ where: query, name: nameQuery, from: needBy, to: needUntil }}
          origin={origin}
          onWhereChange={setQuery}
          onWhereResolved={applyPlace}
          onNameChange={setNameQuery}
          onDatesChange={({ from, to }) => {
            setNeedBy(from);
            setNeedUntil(to);
          }}
          onLocate={() => void geo()}
          onSubmit={() => void applyQuery()}
        />
        <ExploreCategoryChips
          selected={activeCat}
          counts={exploreCatCounts}
          onSelect={writeCategorySearch}
        />
        <SearchAgeGate
          age={searchAge ?? ""}
          start={searchStart ?? ""}
          hideAge
          onAge={(age) => writeNowLoopSearch({ age })}
          onStart={(start) => writeNowLoopSearch({ start })}
        />
        <DualAnchorBar
          mode={anchorMode}
          onMode={setAnchorMode}
          home={origin}
          work={workOrigin}
          workQuery={workQuery}
          onWorkQuery={setWorkQuery}
          onWorkResolved={(place) => {
            setWorkOrigin(place);
            setWorkQuery(place.label);
            if (anchorMode === "home") setAnchorMode("both");
          }}
          onClearWork={() => {
            setWorkOrigin(null);
            setWorkQuery("");
            setAnchorMode("home");
          }}
        />
        {anchors.mode === "both" && workOrigin ? (
          <p className="mt-2 text-xs text-muted">
            {t("anchorBothHint").replace("{n}", String(shownRadius)).replace("{u}", u)}
          </p>
        ) : anchors.mode === "work" && workOrigin ? (
          <p className="mt-2 text-xs text-muted">{t("anchorWorkHint")}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex h-11 w-full basis-full rounded-full bg-surface p-0.5 ring-1 ring-border sm:w-auto sm:basis-auto sm:min-w-[13.5rem] sm:flex-none">
            <button
              type="button"
              onClick={() => setLiveOnly(true)}
              className={cn(
                "min-w-0 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-[13px]",
                liveOnly ? "bg-ok text-primary-fg" : "text-muted",
              )}
            >
              {items !== null && fabric.live > 0
                ? t("liveToggleCount").replace("{n}", String(fabric.live))
                : t("liveOnly")}
            </button>
            <button
              type="button"
              onClick={() => setLiveOnly(false)}
              className={cn(
                "min-w-0 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-[13px]",
                !liveOnly ? "bg-fg text-bg" : "text-muted",
              )}
            >
              {items !== null ? t("allToggleCount").replace("{n}", String(catalog.length)) : t("showAll")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFilters((v) => !v)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-semibold ring-1 sm:text-[13px]",
              filters || extraFilters ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            {t("filters")}
            {extraFilters ? (
              <span className="grid size-4 place-items-center rounded-full bg-bg text-[10px] text-fg">
                {extraFilters}
              </span>
            ) : null}
          </button>
          <div className="flex h-11 w-full basis-full rounded-full bg-surface p-0.5 ring-1 ring-border sm:w-auto sm:basis-auto sm:min-w-[10rem] sm:flex-none">
            <button
              type="button"
              onClick={() => {
                dismissPopovers();
                setView("list");
              }}
              className={cn(
                "min-w-0 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-[13px]",
                view === "list" ? "bg-fg text-bg" : "text-muted",
              )}
            >
              {t("explore")}
            </button>
            <button
              type="button"
              onClick={() => {
                dismissPopovers();
                setView("map");
              }}
              className={cn(
                "min-w-0 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold sm:px-4 sm:text-[13px]",
                view === "map" ? "bg-fg text-bg" : "text-muted",
              )}
            >
              {t("map")}
            </button>
          </div>
        </div>

        {askLocation ? (
          <div className="mt-3">
            <LocationConsentCard
              onAllow={() => void allowLocation()}
              onLater={() => setAskLocation(false)}
            />
          </div>
        ) : null}

        <ExploreHint />

        {filters ? (
          <div className="mt-3 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("filters")}</p>
              <ChipButton onClick={() => setFilters(false)}>{t("close")}</ChipButton>
            </div>
            {filterChips}
            {radiusSlider}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["match", t("sortMatch")],
                  ["urgency", t("sortUrgency")],
                  ["recommended", t("sortRecommended")],
                  ["distance", t("sortDistance")],
                  ["price", t("sortPrice")],
                  ["rating", t("sortRating")],
                  ["availability", t("sortOpen")],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <ChipButton key={k} on={sort === k} aria-pressed={sort === k} onClick={() => setSort(k)}>
                  {label}
                </ChipButton>
              ))}
            </div>
            {sort === "recommended" ? (
              <p className="text-xs text-muted">{t("sortRecommendedLead")}</p>
            ) : null}
            {sort === "match" ? <p className="text-xs text-muted">{t("sortMatchLead")}</p> : null}
            {sort === "urgency" ? (
              <p className="text-xs text-muted">{t("sortUrgencyLead")}</p>
            ) : null}
            <label className="block text-sm">
              <span className="font-medium">{t("needBy")}</span>
              <input
                type="date"
                className="ke-input mt-1 w-full max-w-xs"
                value={needBy}
                onChange={(e) => setNeedBy(e.target.value)}
              />
              <span className="mt-1 block text-xs text-subtle">
                {needBy ? needBy : t("needByAny")}
              </span>
            </label>
            <div>
              <label className="inline-flex items-center gap-1.5 text-sm font-medium text-fg">
                <Sparkles className="size-4" />
                {t("match")}
              </label>
              <textarea
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                placeholder={t("matchPh")}
                rows={2}
                className="ke-textarea mt-2 min-h-[4.5rem]"
              />
              <Button
                type="button"
                className="mt-3"
                disabled={matchBusy || !need.trim()}
                onClick={() => void runMatch()}
              >
                {t("matchGo")}
              </Button>
              {matchNote ? <p className="mt-3 text-sm text-muted">{matchNote}</p> : null}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "ke-search-results mt-2 contain-layout",
            view !== "map" && "min-h-[22rem]",
            refreshing && "opacity-70",
          )}
        >
          {view === "map" ? (
            mapEnabled ? (
              <div className="mt-4 space-y-3">
                <div className="h-[62dvh] min-h-[18rem] overflow-hidden rounded-xl shadow-card ring-1 ring-border lg:h-[70vh]">
                  <Suspense fallback={<div className="ke-skel size-full" aria-hidden="true" />}>
                    <MapView
                      items={shownList}
                      origin={mapOrigin}
                      secondOrigin={anchors.intersect && workOrigin ? workOrigin : null}
                      radiusKm={radiusKm}
                      activeSlug={active}
                      onSelect={(slug) => setActive(slug)}
                      onRelocate={(pos) => {
                        const resolved = originFromDeviceFix(pos, origin);
                        const label =
                          resolved.source === "gps"
                            ? reverseGeocode(pos.lat, pos.lng)
                            : resolved.label;
                        setOrigin({ lat: resolved.lat, lng: resolved.lng, label }, resolved.source);
                        void hapticLight();
                      }}
                      onLocate={() => void geo()}
                    />
                  </Suspense>
                </div>
                {gated && items !== null && showSearchEmpty ? (
                  <div className="rounded-xl bg-surface ring-1 ring-border">
                    <EmptyState
                      title={emptyState.title}
                      body={emptyState.body}
                      action={emptyState.action}
                      onAction={emptyState.onAction}
                      secondary={emptyState.secondary}
                      onSecondary={emptyState.onSecondary}
                      secondaryTo={emptyState.secondaryTo}
                    />
                  </div>
                ) : null}
              </div>
            ) : null
          ) : !gated ? (
            <div className="mt-6 rounded-xl bg-surface ring-1 ring-border">
              <EmptyState title={t("searchAgeGateTitle")} body={t("searchNeedAgeStart")} />
            </div>
          ) : items === null ? (
            <div className="mt-4 space-y-8" aria-busy="true" aria-label={t("searchCountLoading")}>
              {Array.from({ length: 2 }).map((_, rail) => (
                <div key={rail} aria-hidden="true">
                  <div className="ke-skel mb-3 h-7 w-44" />
                  <div className="ke-rail">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="ke-rail-card space-y-2">
                        <div className="ke-skel aspect-[20/19] w-full" />
                        <div className="ke-skel h-3.5 w-4/5" />
                        <div className="ke-skel h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : showSearchEmpty ? (
            <div className="mt-6 rounded-xl bg-surface ring-1 ring-border">
              <EmptyState
                title={emptyState.title}
                body={emptyState.body}
                action={emptyState.action}
                onAction={emptyState.onAction}
                secondary={emptyState.secondary}
                onSecondary={emptyState.onSecondary}
                secondaryTo={emptyState.secondaryTo}
              />
            </div>
          ) : (
            <section
              className="mt-6"
              onMouseOver={(e) => {
                const node = (e.target as HTMLElement).closest("[data-slug]");
                const slug = node?.getAttribute("data-slug");
                if (slug) setActive(slug);
              }}
            >
              {sort === "match" || sort === "urgency" ? (
                <>
                  <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] md:text-[1.45rem]">
                    {sort === "match" ? t("sortMatch") : t("sortUrgency")}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {sort === "match" ? t("sortMatchLead") : t("sortUrgencyLead")}
                  </p>
                </>
              ) : null}
              <div className="ke-listings mt-4">
                {shownList.map((item, i) => (
                  <DaycareCard key={item.id} item={item} eager={i < 4} />
                ))}
              </div>
            </section>
          )}
          {gated && split.ageUnknown.length ? (
            <div className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border">
              <p className="font-semibold">{t("ageNotConfirmed")}</p>
              <p className="mt-1 text-sm text-muted">{t("ageNotConfirmedLead")}</p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-primary"
                onClick={() => setAgeUnknownOpen((v) => !v)}
              >
                {ageUnknownOpen ? t("ageNotConfirmedHide") : t("ageNotConfirmedOpen")}
              </button>
              {ageUnknownOpen ? (
                <div className="ke-listings mt-4">
                  {split.ageUnknown.map((item) => (
                    <DaycareCard key={item.id} item={item} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
    </Shell>
  );
}
