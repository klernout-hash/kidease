import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { Shell } from "@/components/shell";
import { ParentHelperPanel } from "@/components/parent-helper";
import { Button } from "@/components/ui/button";
import { listedDaycareTypeFromSearch } from "@/lib/care-type";
import { DaycareTypeRails } from "@/components/facility-type-rail-list";
import { BROWSE_RAIL_COPY, type BrowseDaycareType } from "@/components/facility-type-rails";
import { ExploreCategoryChips } from "@/components/explore-category-chips";
import { ExploreFilterBar } from "@/components/explore-filter-bar";
import { ExploreFilterChips } from "@/components/explore-filter-chips";
import { PioneerFilterRail } from "@/components/pioneer-filter-rail";
import { InclusiveCareFilters } from "@/components/inclusive-care-filters";
import { LicenceTypeFilters } from "@/components/licence-type-filters";
import { careKeysParam, parseCareKeys, type CareDetailKey } from "@/lib/inclusive-search";
import { type LicenceBucket } from "@/lib/phase1-search";
import { CommuteDetourBar } from "@/components/commute-detour-bar";
import { SearchCardAgesProvider, SearchCardOriginProvider } from "@/components/search-card-context";
import { resolveSearchCardOrigin } from "@/lib/search-card-origin";
import { DaycareCard } from "@/components/daycare-card";
import { AreaWaitlistForm } from "@/components/area-waitlist-form";
import { SEARCH_PAGE_MAX, pageFromSearch } from "@/lib/search-page";
import { searchDaycareMap, searchDaycarePage } from "@/lib/server/daycares";
import { normalizeSearchResultFilters, schoolAgeOnlyFromSearch } from "@/lib/search-result-filters";
import { searchMapState, type SearchMapResult } from "@/lib/search-map-state";
import { readSearchEvidence, searchEvidence } from "@/lib/search-evidence";
import { createSearchLoaderRead, createSearchRequestGate, searchCoverageCopy, searchMapCount } from "@/lib/search-coverage";
import type { MapPin } from "@/lib/map-cluster";
import { matchCentres } from "@/lib/server/ai";
import { isIqaluitQuery, reverseGeocode } from "@/lib/geo";
import { originFromDeviceFix, productHomeOrigin, readClientTimeZone, searchOriginOrWinnipeg } from "@/lib/default-origin";
import { BootPending } from "@/components/boot-pending";
import { CARD_SIZES, CARD_WIDTHS, photoSrcSet, photoUrl } from "@/lib/photo";
import { ORIGIN_BUDGET_MS, PAINT_BUDGET_MS, SQL_SETTLE_MS, withPaintBudget, withTimeoutFallback } from "@/lib/timeout";
import { bootSearchOrigin } from "@/lib/search-origin";
import { isGenericCareQuery } from "@/lib/generic-care-query";
import {
  anchorsForSearchMap,
  cityParamFromUnknown,
  originFromSearchQuery,
  originsMatchSearchQuery,
  indexedPlaceQuery,
  coerceSearchText,
  searchQueryFromUnknown,
} from "@/lib/search-query";
import { resolveSearchDirectory } from "@/lib/city-directory";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { filterByLocationLock, resolveLocationLock } from "@/lib/location-lock";
import { publicListings } from "@/lib/listing-visibility";
import { fsaOf, MAX_SEARCH_RADIUS_KM } from "@/lib/proximity";
import { areaPresence } from "@/lib/presence";
import { readSearchCache, searchCacheKey, writeSearchCache, type SearchPageResponse } from "@/lib/search-cache";
import { readRecentSearches, rememberSearch, writeRecentSearches, type RecentSearch } from "@/lib/recent-searches";
import { parentFitCacheKey } from "@/lib/parent-fit";
import { parentFitFromSearch, useParentFitFacts } from "@/lib/use-parent-fit";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useLivePresence } from "@/lib/use-presence";
import { trackLocation } from "@/lib/telemetry";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { useAppStore, type SortKey } from "@/lib/store";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { parsePioneerSearch, type PioneerSearch } from "@/lib/pioneer-filters";
import { ChipButton } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { LocationConsentCard } from "@/components/location-consent";
import { DualAnchorBar } from "@/components/dual-anchor-bar";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { MobileSearchResults } from "@/components/mobile-search-sheet";
import { draftFromParams, mergeMobileSearchParams, type MobileSearchParams } from "@/lib/mobile-search-v2";
import { SmartMatchEntry } from "@/components/smart-match";
import { resolveLocationQuery } from "@/components/place-search";
import {
  compactExploreSearch,
  liveSearchParam,
  orderNameMatches,
  parseExploreSearchFields,
  licensedSearchCountLine,
  readLiveSearchFlag,
  splitLiveBrowseHint,
} from "@/lib/explore-search";
import {
  compactParentListingSearch,
  parseParentListingSearch,
  visibleParentChipOptions,
  type ParentListingSearch,
} from "@/lib/parent-listing";
import { getMySearchAnchors, saveMySearchAnchors } from "@/lib/server/search-anchors";
import { MIN_REVIEW_COUNT } from "@/lib/quality";
import { ratingFloor } from "@/lib/review-reports";
import type { DaycareCard as Card } from "@/lib/types";
import { capturePostHogEvent } from "@/lib/posthog";
import { countBucket } from "@/lib/product-events";
import { trackProductEvent } from "@/lib/track-product-event";
import { captureRankingEvent } from "@/lib/ranking/events";
import { publishRankingContext } from "@/lib/ranking/context";
import { rankingCity } from "@/lib/ranking/market";
import { useRankingBestMatchFlag } from "@/lib/ranking/use-ranking-flag";
import { assignRankingVariant, parseRankingOverride } from "@/lib/ranking/variant";
import { DEFAULT_SEARCH_SORT, parseSearchSort } from "@/lib/search-sort";
import type { RankAge } from "@/lib/ranking/score";
import { isSearchStart, type SearchStart } from "@/lib/search-start";
import {
  honestVacancy,
  isSearchAge,
  listingAgeUnknown,
  searchFiltersReady,
  splitSearchResults,
  startWindowToDate,
  type SearchAge,
} from "@/lib/now-loops";
import {
  RAIL_AGES,
  isCareType,
  isRailAge,
  matchesRailAge,
  type CareType,
  type RailAge,
} from "@/lib/care-type";
import { standardAgeLabel } from "@/lib/standard-age-groups";
import {
  EXPLORE_CATEGORY_COPY,
  countExploreCategories,
  exploreOpeningsSelected,
  formatExploreRailAges,
  isExploreCategory,
  isFacilityExploreCategory,
  parseExploreRailAges,
  resolvedExploreCategory,
  toggleExploreRailAge,
  type ExploreCategory,
} from "@/lib/explore-categories";
import { parentSignupSearch } from "@/lib/auth/parent-login";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload, signupPromptStep } from "@/lib/signup-funnel";
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
import { cityHubDefForPlace, cityHubPath } from "@/lib/city-hubs";
import { normalizeProvinceCode } from "@/lib/location-lock";
import { EXPLORE_AGE_RAIL_COPY, preferCompleteCards } from "@/lib/explore-category-rails";
import { dismissPopovers } from "@/lib/dismiss-popovers";
import { MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";

import { StoreMapFallback } from "@/components/store-map-fallback";
import { useStoreChannel } from "@/lib/use-native-shell";

const MapView = lazy(() => import("@/components/map-view").then((m) => ({ default: m.MapView })));
const EMPTY_MAP_PINS: MapPin[] = [];
const CompareBar = lazy(() =>
  import("@/components/compare-bar").then((m) => ({ default: m.CompareBar })),
);

export async function searchLoader({ location, abortController }: { location: { search: unknown }; abortController?: AbortController }) {
    const { reviewReportsEnabled } = await import("@/lib/features");
    const { readMobileSearchV2 } = await import("@/lib/mobile-search-flag");
    const mobileSearchV2Read = readMobileSearchV2().catch(() => false);
    const reviewRatingFloor = ratingFloor(reviewReportsEnabled(), MIN_REVIEW_COUNT);
    const rawQ = searchQueryFromUnknown(location.search);
    const genericCare = isGenericCareQuery(rawQ);
    const q = genericCare ? "" : rawQ;
    const city = cityParamFromUnknown(location.search);
    const decision = resolveSearchDirectory({ q, city });
    if (decision.kind === "unknown") {
      return {
        items: [] as Card[],
        itemsReady: true,
        unknownCity: true as const,
        needsPlace: false as const,
        origin: { lat: 0, lng: 0, label: city, source: "manual" as const },
        page: 1,
        hasMore: false,
        total: 0,
        nextPage: null,
        pageLimitReached: false,
        evidence: searchEvidence(),
        reviewRatingFloor,
        mobileSearchV2: await mobileSearchV2Read,
      };
    }
    const place = q || (city ? originFromSearchQuery(city)?.label || city : "");
    const fromQ = originFromSearchQuery(place);
    const resolvedOrigin = fromQ
      ? { lat: fromQ.lat, lng: fromQ.lng, label: fromQ.label, source: "manual" as const }
      : searchOriginOrWinnipeg(
          await withTimeoutFallback(resolveRequestSearchOrigin(), ORIGIN_BUDGET_MS, productHomeOrigin()),
        );
    const origin = resolvedOrigin;
    if (!place && !(origin.label || "").trim()) {
      return {
        items: [] as Card[],
        itemsReady: true,
        unknownCity: false as const,
        needsPlace: true as const,
        origin,
        page: 1,
        hasMore: false,
        total: 0,
        nextPage: null,
        pageLimitReached: false,
        evidence: searchEvidence(),
        reviewRatingFloor,
        mobileSearchV2: await mobileSearchV2Read,
      };
    }
    const page = pageFromSearch(location.search);
    const searchRecord =
      location.search && typeof location.search === "object" ? (location.search as Record<string, unknown>) : {};
    const explicitSort =
      typeof searchRecord.sort === "string" && searchRecord.sort ? parseSearchSort(searchRecord.sort) : null;
    const bootRank = parseRankingOverride(searchRecord.rank);
    const sort = explicitSort ?? (bootRank === "nearest" ? "distance" : DEFAULT_SEARCH_SORT);
    const pageRequest = {
      data: {
        lat: origin.lat,
        lng: origin.lng,
        radiusKm: 25,
        sort,
        ageGroup: "any" as const,
        label: origin.label,
        q: place || origin.label,
        city: city || undefined,
        facility: listedDaycareTypeFromSearch(location.search),
        page,
        name: (
          (
            location.search && typeof location.search === "object" && "name" in location.search
              ? String((location.search as { name?: unknown }).name || "")
              : ""
          ).trim() || (genericCare ? rawQ : "")
        ),
        live: readLiveSearchFlag(
          location.search && typeof location.search === "object" && "live" in location.search
            ? (location.search as { live?: unknown }).live
            : undefined,
        ),
        diet: careKeysParam(parseCareKeys(searchRecord.diet)),
        filters: normalizeSearchResultFilters({
          pioneer: parsePioneerSearch(searchRecord),
          parent: parseParentListingSearch(searchRecord),
          ages: parseExploreRailAges(searchRecord),
          schoolAgeOnly: schoolAgeOnlyFromSearch(searchRecord),
          category: searchRecord.cat,
          openings: exploreOpeningsSelected(searchRecord),
          start: searchRecord.start,
          needBy: searchRecord.from,
          diet: careKeysParam(parseCareKeys(searchRecord.diet)),
          name: searchRecord.name,
        }),
      },
    };
    const indexed = indexedPlaceQuery(place, city);
    type SearchPaint = {
      value: Awaited<ReturnType<typeof searchDaycarePage>> | null;
      ready: boolean;
    };
    const read = createSearchLoaderRead(abortController?.signal);
    let painted: SearchPaint = { value: null, ready: false };
    try {
      painted = indexed
        ? await withTimeoutFallback<SearchPaint>(
            searchDaycarePage({ ...pageRequest, signal: read.signal }).then((value) => ({ value, ready: true })),
            SQL_SETTLE_MS,
            { value: null, ready: false },
          )
        : await withPaintBudget(searchDaycarePage({ ...pageRequest, signal: read.signal }), PAINT_BUDGET_MS);
    } finally {
      read.finish(painted.ready);
    }
    return {
      items: painted.value?.items ?? [],
      itemsReady: painted.ready,
      origin,
      unknownCity: false as const,
      needsPlace: false as const,
      page: painted.value?.page ?? page,
      hasMore: painted.value?.hasMore === true,
      total: painted.value?.total ?? 0,
      nextPage: painted.value?.nextPage ?? null,
      pageLimitReached: painted.value?.pageLimitReached === true,
      evidence: readSearchEvidence(painted.value?.evidence),
      reviewRatingFloor,
      mobileSearchV2: await mobileSearchV2Read,
    };
}

export function searchValidateSearch(s: Record<string, unknown>) {
    const fields = parseExploreSearchFields(s);
    const out: {
      q?: string;
      name?: string;
      from?: string;
      to?: string;
      sort?: SortKey;
      age?: string;
      start?: SearchStart;
      cat?: ExploreCategory;
      care?: CareType;
      favorites?: "1";
      openings?: "1";
      ages?: string;
      open?: string;
      sched?: string;
      fac?: string;
      city?: string;
      rank?: "best" | "nearest";
      page?: number;
      live?: 1;
      diet?: string;
      cwelcc?: "1";
      inclusive?: "1";
      meals?: "1";
      subsidy?: "1";
      lang?: string;
    } = { ...fields };
    const city = typeof s.city === "string" ? s.city.trim().slice(0, 80) : "";
    if (city) out.city = city;
    const sort = typeof s.sort === "string" ? s.sort : "";
    if (
      ["distance", "price", "rating", "availability", "recommended", "match", "urgency", "best"].includes(
        sort,
      )
    ) {
      out.sort = sort as SortKey;
    }
    const rank = parseRankingOverride(s.rank);
    if (rank) out.rank = rank;
    const page = pageFromSearch(s);
    if (page > 1) out.page = page;
    const ageCsv = formatExploreRailAges(parseExploreRailAges({ age: s.age, cat: s.cat }));
    if (ageCsv) out.age = ageCsv;
    if (s.openings === "1" || s.openings === true || s.openings === 1) out.openings = "1";
    if (readLiveSearchFlag(s.live)) out.live = 1;
    if (typeof s.start === "string" && isSearchStart(s.start)) out.start = s.start;
    if (typeof s.cat === "string" && isExploreCategory(s.cat)) out.cat = s.cat;
    if (typeof s.care === "string" && isCareType(s.care)) out.care = s.care;
    else if (typeof s.facility === "string" && isCareType(s.facility)) out.care = s.facility;
    if (s.favorites === "1" || s.favorites === true) out.favorites = "1";
    const diet = careKeysParam(parseCareKeys(s.diet));
    if (diet) out.diet = diet;
    const parent = compactParentListingSearch(parseParentListingSearch(s));
    return { ...out, ...parent, ...parsePioneerSearch(s) };
}

export function searchPageHead(
  kind: "en" | "fr",
  loaderData: { items?: Array<{ photos?: string[] | null }> } | undefined,
) {
  const seo = pageSeoHead(kind === "fr" ? MARKETING_PAGE_SEO_FR.search : MARKETING_PAGE_SEO.search);
  const src = loaderData?.items?.[0]?.photos?.[0];
  const image =
    src && !src.startsWith("data:")
      ? [
          {
            rel: "preload" as const,
            as: "image" as const,
            href: photoUrl(src, 480),
            imageSrcSet: photoSrcSet(src, CARD_WIDTHS),
            imageSizes: CARD_SIZES,
            fetchPriority: "high" as const,
          },
        ]
      : [];
  return { ...seo, links: [...seo.links, ...image] };
}

export const Route = createFileRoute("/search")({
  loader: searchLoader,
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  validateSearch: searchValidateSearch,
  head: ({ loaderData }) => searchPageHead("en", loaderData),
  component: SearchRoute,
});

function SearchRoute() {
  return <SearchScreen boot={Route.useLoaderData()} incoming={Route.useSearch()} />;
}

const PRESETS_KM = [1, 5, 10, 15, 25, 40, 50];

export function SearchScreen({
  boot,
  incoming: incomingRaw,
}: {
  boot: Awaited<ReturnType<typeof searchLoader>>;
  incoming: ReturnType<typeof searchValidateSearch>;
}) {
  const incoming = useMemo(() => {
    const q = coerceSearchText(incomingRaw.q).slice(0, 160) || undefined;
    const city = coerceSearchText(incomingRaw.city).slice(0, 80) || undefined;
    if (q === incomingRaw.q && (city || undefined) === (incomingRaw.city || undefined)) return incomingRaw;
    return { ...incomingRaw, q, city };
  }, [incomingRaw]);
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const fitFacts = useParentFitFacts();
  const [budgetMonthly, setBudgetMonthly] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const navigate = useNavigate({ from: locale === "fr" ? "/fr/search" : "/search" });
  const bootHoldUrl = useRef(false);
  const typedPlace = (incoming.q || "").trim() || (incoming.city || "").trim();
  const bootLabel = (boot.origin?.label || "").trim();
  if (typeof window !== "undefined" && !typedPlace && bootLabel && !(useAppStore.getState().origin.label || "").trim()) {
    const source = boot.origin.source === "ip" ? "ip" : "default";
    bootHoldUrl.current = true;
    useAppStore.getState().setOrigin({ lat: boot.origin.lat, lng: boot.origin.lng, label: bootLabel }, source);
    useAppStore.getState().setQuery(bootLabel);
  }
  const origin = useAppStore((s) => s.origin);
  const originSource = useAppStore((s) => s.originSource);
  const cardOrigin = useMemo(() => resolveSearchCardOrigin({
    storedOrigin: origin,
    storedSource: originSource,
    bootOrigin: boot.origin,
    unknownCity: boot.unknownCity,
    needsPlace: boot.needsPlace,
  }), [origin, originSource, boot.origin, boot.unknownCity, boot.needsPlace]);
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
  const rankOverride = parseRankingOverride(incoming.rank);
  const rankingFlag = useRankingBestMatchFlag();
  const rankingDefaulted = useRef(false);
  const rankingVariant = assignRankingVariant({ flag: rankingFlag, override: rankOverride });
  const showBestMatch = rankingVariant === "best_match" || sort === "best";
  useEffect(() => {
    if (rankingDefaulted.current) return;
    if (incoming.sort) {
      rankingDefaulted.current = true;
      return;
    }
    rankingDefaulted.current = true;
    if (rankOverride === "nearest") setSort("distance");
    else setSort(DEFAULT_SEARCH_SORT);
  }, [rankOverride, incoming.sort, setSort]);
  function pickSort(next: SortKey) {
    rankingDefaulted.current = true;
    setSort(next);
  }
  const ageGroup = useAppStore((s) => s.ageGroup);
  const setAgeGroup = useAppStore((s) => s.setAgeGroup);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const [items, setItems] = useState<Card[] | null>(
    boot.needsPlace || boot.unknownCity
      ? boot.items
      : boot.itemsReady && boot.items.length === 0
        ? boot.items
        : boot.items.length > 0 && (Boolean(incoming.name) || originsMatchSearchQuery(boot.origin, incoming.q))
          ? incoming.name
            ? boot.items
            : filterByLocationLock(
                boot.items,
                resolveLocationLock({ ...boot.origin, q: incoming.q }),
              )
          : null,
  );
  const resultPage = incoming.page ?? 1;
  const [nextPage, setNextPage] = useState<number | null>(boot.nextPage);
  const [pageLimitReached, setPageLimitReached] = useState(boot.pageLimitReached);
  const [resultEvidence, setResultEvidence] = useState(boot.evidence);
  const [resultTotal, setResultTotal] = useState(boot.total ?? 0);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);
  useEffect(() => {
    if (!filters) return;
    const frame = requestAnimationFrame(() => {
      const title = document.getElementById("search-filters-title");
      title?.focus({ preventScroll: true });
      title?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [filters]);

  function closeFilters() {
    setFilters(false);
    requestAnimationFrame(() => {
      const toggles = document.querySelectorAll<HTMLElement>('[data-ke="msv2-filters"], [data-ke="explore-filters-toggle"]');
      Array.from(toggles).find((button) => button.getClientRects().length > 0)?.focus();
    });
  }
  const [need, setNeed] = useState("");
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [avail, setAvail] = useState<"any" | "open" | "waitlist" | "unknown">("any");
  const [ten, setTen] = useState(false);
  const [meals, setMeals] = useState(false);
  const [outdoor, setOutdoor] = useState(false);
  const [inclusive, setInclusive] = useState(false);
  const dietParam = careKeysParam(parseCareKeys(incoming.diet)) || "";
  const [careKeys, setCareKeys] = useState<CareDetailKey[]>(() => parseCareKeys(incoming.diet));
  const [licence, setLicence] = useState<LicenceBucket | null>(null);
  const [extended, setExtended] = useState(false);
  const [infantOnly, setInfantOnly] = useState(false);
  const [catchmentOnly, setCatchmentOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [claimVerifiedOnly, setClaimVerifiedOnly] = useState(readLiveSearchFlag(incoming.live));
  const [needBy, setNeedBy] = useState(incoming.from ?? "");
  const [needUntil, setNeedUntil] = useState(incoming.to ?? "");
  const [nameQuery, setNameQuery] = useState(
    (incoming.name || (isGenericCareQuery(incoming.q) ? incoming.q : "") || "").trim(),
  );
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [careType, setCareType] = useState<CareType | "any">("any");
  const [schoolAgeOnly, setSchoolAgeOnly] = useState(() => schoolAgeOnlyFromSearch(incoming));
  const [licensedChip, setLicensedChip] = useState(true);
  const [topRatedChip, setTopRatedChip] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [workQuery, setWorkQuery] = useState("");
  const [anchorsHydrated, setAnchorsHydrated] = useState(false);
  const locationConsent = useAppStore((s) => s.locationConsent);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);
  const [askLocation, setAskLocation] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(false);
  const storeChannel = useStoreChannel();
  const [searchFailed, setSearchFailed] = useState(false);
  const [mapResult, setMapResult] = useState<SearchMapResult | null>(null);
  const [mapFailedKey, setMapFailedKey] = useState<string | null>(null);
  const [mapPendingKey, setMapPendingKey] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<{ pageKey: string; mapKey: string; attempt: number } | null>(null);
  const pageGate = useRef(createSearchRequestGate());
  const mapGate = useRef(createSearchRequestGate());
  const pageAbort = useRef<AbortController | null>(null);
  const mapAbort = useRef<AbortController | null>(null);
  useLivePresence(locationConsent === "granted");

  useEffect(() => {
    if (view === "map") setMapEnabled(true);
  }, [view]);

  useEffect(() => {
    const place = (incoming.q || "").trim() || (incoming.city || "").trim();
    let cancelled = false;
    if (!place) bootHoldUrl.current = true;
    void bootSearchOrigin(place, boot.origin).finally(() => {
      if (cancelled) return;
      bootHoldUrl.current = false;
      const label = useAppStore.getState().origin.label.trim();
      if (place && isGenericCareQuery(place)) {
        // Keep the care word as a name keyword; do not treat it as the place pin.
        writeExploreSearch({
          q: label || undefined,
          name: place,
          from: needBy,
          to: needUntil,
        });
        return;
      }
      if (!place && label && !(incoming.q || "").trim()) {
        writeExploreSearch({ q: label, name: nameQuery, from: needBy, to: needUntil });
      }
    });
    return () => {
      cancelled = true;
    };
    // The URL write waits until GPS or the Winnipeg fallback settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only when the place in the URL changes
  }, [incoming.q, incoming.city, boot.origin]);

  useEffect(() => {
    if (incoming.sort) setSort(incoming.sort);
    const selectedAges = parseExploreRailAges(incoming);
    const cat = resolvedExploreCategory(incoming);
    const ageGate = (
      selectedAges.length === 1 ? selectedAges[0] : cat && isRailAge(cat) ? cat : undefined
    ) as RailAge | undefined;
    setSchoolAgeOnly(schoolAgeOnlyFromSearch(incoming));
    if (ageGate === "school-age") {
      setAgeGroup("any");
    } else if (ageGate) {
      setAgeGroup(ageGate);
    } else {
      setAgeGroup("any");
    }
    if (incoming.care) setCareType(incoming.care);
    if (incoming.favorites === "1") setFavoritesOnly(true);
    if (incoming.start === "now" || incoming.start === "this-month" || incoming.start === "next-month") {
      setNeedBy(startWindowToDate(incoming.start));
    }
  }, [incoming.sort, incoming.age, incoming.cat, incoming.care, incoming.favorites, incoming.start, incoming.openings, setSort, setAgeGroup]);

  useEffect(() => {
    if (readLiveSearchFlag(incoming.live)) setClaimVerifiedOnly(true);
  }, [incoming.live]);

  useEffect(() => {
    setNameQuery((incoming.name || (isGenericCareQuery(incoming.q) ? incoming.q : "") || "").trim());
  }, [incoming.name, incoming.q]);

  useEffect(() => {
    setNeedBy(incoming.from ?? "");
    setNeedUntil(incoming.to ?? "");
  }, [incoming.from, incoming.to]);

  useEffect(() => {
    const saved = takeSavedSearchToApply();
    if (!saved) return;
    setOrigin({ lat: saved.centerLat, lng: saved.centerLng, label: saved.centerLabel, explicit: true });
    setRadiusKm(saved.radiusKm);
    if (saved.ageBand === "school-age") {
      setSchoolAgeOnly(true);
      setAgeGroup("any");
    } else {
      setSchoolAgeOnly(false);
      setAgeGroup(saved.ageBand === "any" ? "any" : saved.ageBand);
    }
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
    const payload = { home: origin, work: workOrigin, mode: anchorMode };
    const key = JSON.stringify(payload);
    const tmr = window.setTimeout(() => {
      void dedupedQuery(`save-anchors:${user.id}:${key}`, QUERY_STALE_MS, () =>
        saveMySearchAnchors({ data: payload }).then(() => true),
      ).catch(() => undefined);
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

  const requestedPlace =
    (incoming.q || "").trim() ||
    (incoming.city ? originFromSearchQuery(incoming.city)?.label || "" : "");
  const unknownCity = Boolean(
    (incoming.city || "").trim() && !(incoming.q || "").trim() && !originFromSearchQuery(incoming.city),
  );
  const workForSearch = workQuery.trim() && workOrigin ? workOrigin : null;
  const viewAnchors = useMemo(
    () =>
      anchorsForSearchMap({
        lat: origin.lat,
        lng: origin.lng,
        radiusKm,
        q: requestedPlace,
        query,
        label: origin.label,
        work: workForSearch,
        mode: anchorMode,
      }),
    [
      origin.lat,
      origin.lng,
      origin.label,
      radiusKm,
      requestedPlace,
      query,
      workQuery,
      workForSearch?.lat,
      workForSearch?.lng,
      anchorMode,
    ],
  );
  const cameraHome = viewAnchors.home;
  const placeQuery = viewAnchors.q;
  const askedAges = parseExploreRailAges(incoming);
  const pickedAge = askedAges.length === 1 ? askedAges[0] : undefined;
  const rankAge: RankAge =
    pickedAge === "infant" || pickedAge === "toddler" || pickedAge === "preschool" || pickedAge === "school-age"
      ? pickedAge
      : "any";
  const rankSchedules = parseParentListingSearch(incoming).sched;
  const resultFilters = normalizeSearchResultFilters({
    pioneer: parsePioneerSearch(incoming),
    parent: parseParentListingSearch(incoming),
    liveOnly, availability: avail, ten, meals, outdoor, inclusive,
    diet: dietParam, licence, extended, infantOnly, catchmentOnly,
    confirmedOnly, readyOnly, claimVerifiedOnly, favoritesOnly,
    careType, schoolAgeOnly, category: incoming.cat,
    ages: parseExploreRailAges(incoming), openings: exploreOpeningsSelected(incoming),
    start: incoming.start, needBy, name: nameQuery,
    licensedOnly: boot.mobileSearchV2 && mobileViewport && licensedChip,
    topRatedOnly: boot.mobileSearchV2 && mobileViewport && topRatedChip,
  });
  const resultFiltersKey = JSON.stringify(resultFilters);
  const searchData = {
    lat: cameraHome.lat,
    lng: cameraHome.lng,
    radiusKm,
    sort,
    ageGroup: "any" as const,
    rankAge,
    wantSubsidy: ten,
    wantExtendedHours: extended,
    schedules: rankSchedules,
    countDemand: resultPage === 1,
    page: resultPage,
    fsa: fsaOf(query) || fsaOf(cameraHome.label),
    label: cameraHome.label,
    q: placeQuery,
    city: (incoming.city || "").trim() || undefined,
    facility: listedDaycareTypeFromSearch(incoming),
    startDate: needBy || null,
    name: nameQuery.trim() || undefined,
    live: claimVerifiedOnly || readLiveSearchFlag(incoming.live),
    diet: dietParam || undefined,
    filters: resultFilters,
    lat2: viewAnchors.cityOwned ? undefined : workForSearch?.lat,
    lng2: viewAnchors.cityOwned ? undefined : workForSearch?.lng,
    mode: viewAnchors.mode,
    parentFit: parentFitFromSearch({
      facts: fitFacts,
      home: { lat: cameraHome.lat, lng: cameraHome.lng },
      work: viewAnchors.cityOwned || !workForSearch ? null : { lat: workForSearch.lat, lng: workForSearch.lng },
      radiusKm,
      budgetMonthly: Number(budgetMonthly) > 0 ? Math.round(Number(budgetMonthly)) : null,
      wantSubsidy: ten,
    }),
  };
  const fitKey = parentFitCacheKey(searchData.parentFit);
  const cacheInput = {
    lat: cameraHome.lat,
    lng: cameraHome.lng,
    radiusKm,
    sort,
    ageGroup: "any" as const,
    label: cameraHome.label,
    q: placeQuery,
    city: (incoming.city || "").trim() || undefined,
    facility: listedDaycareTypeFromSearch(incoming),
    startDate: needBy || null,
    name: nameQuery.trim() || undefined,
    lat2: viewAnchors.cityOwned ? undefined : workForSearch?.lat,
    lng2: viewAnchors.cityOwned ? undefined : workForSearch?.lng,
    mode: viewAnchors.mode,
    page: resultPage,
    parentFit: fitKey,
    claimLive: claimVerifiedOnly || readLiveSearchFlag(incoming.live),
    diet: dietParam,
    filters: resultFiltersKey,
    ranking: JSON.stringify({ rankAge, ten, extended, schedules: rankSchedules }),
  };
  useEffect(() => {
    setCareKeys(parseCareKeys(dietParam));
  }, [dietParam]);

  const pageKey = searchCacheKey(cacheInput);
  const searchMapKey = searchCacheKey({ ...cacheInput, page: 1 });
  const mapCanSearch = !unknownCity && !(boot.needsPlace && !requestedPlace && !(origin.label || "").trim());
  const pageCanSearch = mapCanSearch || Boolean(nameQuery.trim());
  // Change identity during render, before a late response can reach an effect cleanup.
  pageGate.current.select(pageCanSearch ? pageKey : "");
  mapGate.current.select(view === "map" && mapCanSearch ? searchMapKey : "");
  const requestData = useRef(searchData);
  requestData.current = searchData;
  useEffect(() => {
    if (!pageCanSearch) {
      setItems([]);
      setRefreshing(false);
      setSearchFailed(false);
      setResultTotal(0);
      setResultEvidence(searchEvidence());
      setNextPage(null);
      setPageLimitReached(false);
      return;
    }
    const gate = pageGate.current;
    const ticket = gate.begin(pageKey);
    const controller = new AbortController();
    pageAbort.current = controller;
    let live = true;
    const current = () => live && gate.accepts(ticket);
    const cached = readSearchCache(pageKey);
    const fresh = retryRequest?.pageKey === pageKey;
    const data = requestData.current;
    function apply(result: SearchPageResponse) {
      setItems(result.items);
      setNextPage(result.nextPage);
      setPageLimitReached(result.pageLimitReached);
      setResultTotal(result.total);
      setResultEvidence(readSearchEvidence(result.evidence));
    }
    setRefreshing(true);
    setSearchFailed(false);
    if (cached) apply(cached);
    else {
      setItems(null);
      setNextPage(null);
      setPageLimitReached(false);
      setResultEvidence(searchEvidence());
    }
    const fail = () => {
      if (!current()) return;
      gate.invalidate();
      controller.abort();
      setItems((rows) => rows ?? []);
      setSearchFailed(true);
      setResultEvidence(searchEvidence());
      setNextPage(null);
      setPageLimitReached(false);
      setRefreshing(false);
    };
    const watchdog = window.setTimeout(fail, 12_000);
    const tmr = window.setTimeout(() => {
      if (!current()) return;
      // Search reads use server memoization. Direct calls keep a fresh Retry out
      // of the generic client dedup cache, including its older pending reads.
      void searchDaycarePage({ data: { ...data, refresh: fresh }, signal: controller.signal })
        .then((result) => {
          if (!current()) return;
          const response = { ...result, evidence: readSearchEvidence(result.evidence) };
          apply(response);
          setSearchFailed(false);
          writeSearchCache(pageKey, response);
          captureMarketplaceFunnel({ step: "search", source: "search", dest_path: "/search" });
          if (result.total === 0 && response.evidence.status === "complete") {
            captureMarketplaceFunnel({ step: "zero_result", source: "search", dest_path: "/search" });
          }
        })
        .catch(fail)
        .finally(() => {
          if (!current()) return;
          window.clearTimeout(watchdog);
          setRefreshing(false);
        });
    }, cached && !fresh ? 160 : 0);
    trackLocation("search", cameraHome.lat, cameraHome.lng, cameraHome.label, { radiusKm });
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(tmr);
      window.clearTimeout(watchdog);
    };
  }, [pageKey, pageCanSearch, retryRequest, cameraHome.lat, cameraHome.lng, cameraHome.label, radiusKm]);

  const mapState = searchMapState({ canSearch: mapCanSearch, key: searchMapKey, result: mapResult, failedKey: mapFailedKey, pendingKey: mapPendingKey });
  const currentMapResult = mapState.result;
  const searchMapPins = currentMapResult?.pins ?? EMPTY_MAP_PINS;
  useEffect(() => {
    if (view !== "map" || !mapCanSearch) return;
    const gate = mapGate.current;
    const ticket = gate.begin(searchMapKey);
    const controller = new AbortController();
    mapAbort.current = controller;
    let live = true;
    const current = () => live && gate.accepts(ticket);
    setMapFailedKey(null);
    setMapPendingKey(searchMapKey);
    const fail = () => {
      if (!current()) return;
      gate.invalidate();
      controller.abort();
      setMapFailedKey(searchMapKey);
      setMapPendingKey(null);
    };
    const watchdog = window.setTimeout(fail, 12_000);
    void searchDaycareMap({ data: { ...requestData.current, countDemand: false, refresh: retryRequest?.mapKey === searchMapKey }, signal: controller.signal })
      .then((result) => {
        if (!current()) return;
        setMapResult({ key: searchMapKey, ...result, evidence: readSearchEvidence(result.evidence) });
        setMapPendingKey(null);
      }).catch(fail).finally(() => { window.clearTimeout(watchdog); });
    return () => { live = false; controller.abort(); window.clearTimeout(watchdog); };
  }, [view, searchMapKey, retryRequest, mapCanSearch]);

  const mapCoverage = searchCoverageCopy(currentMapResult?.evidence, locale);
  const mapStatus = mapState.kind === "location" ? (
    <p className="text-sm text-muted" role="status" data-ke="search-map-location">
      {locale === "fr" ? "Choisissez une ville, une adresse ou un code postal pour voir les résultats sur la carte." : "Choose a city, address or postal code to see map results."}
    </p>
  ) : mapState.kind === "error" ? (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="status" data-ke="search-map-error">
      <span>{locale === "fr" ? "Les résultats de la carte n’ont pas pu être chargés." : "Map results could not be loaded."}</span>
      <Button type="button" variant="secondary" size="sm" onClick={retrySearch}>{t("mapRetry")}</Button>
    </div>
  ) : !currentMapResult ? (
    <p className="text-sm text-muted" role="status">{t("mapLoading")}</p>
  ) : (
    <div className="text-sm text-muted" role="status" data-ke="search-map-count">
      <p>{searchMapCount(currentMapResult.pins.length, currentMapResult.total, currentMapResult.evidence, locale)}</p>
      {mapCoverage.incomplete ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-ke="search-map-coverage">
          <span>{mapCoverage.detail}</span>
          <Button type="button" variant="secondary" size="sm" onClick={retrySearch} disabled={refreshing}>{mapCoverage.retry}</Button>
          <Link to={localePath("/", locale)} search={{ change: "1" }} className="inline-flex min-h-11 items-center underline">{mapCoverage.changeArea}</Link>
        </div>
      ) : currentMapResult.pins.length < currentMapResult.total ? (
        <p>{locale === "fr" ? "Certaines fiches ne sont pas affichées sur la carte." : "Some listings are not shown on the map."}</p>
      ) : null}
    </div>
  );

  const parentFilters = useMemo(() => parseParentListingSearch(incoming), [incoming]);
  const liveOn = claimVerifiedOnly || readLiveSearchFlag(incoming.live);

  function withParentSearch(search: Record<string, unknown>) {
    return {
      ...parsePioneerSearch(incoming as Record<string, unknown>),
      ...search,
      ...compactParentListingSearch(parentFilters),
    };
  }

  function writePioneer(next: PioneerSearch) {
    void navigate({
      search: withParentSearch({
        q: incoming.q,
        name: incoming.name,
        from: incoming.from,
        to: incoming.to,
        sort: incoming.sort,
        age: incoming.age,
        start: incoming.start,
        cat: incoming.cat,
        care: incoming.care,
        favorites: incoming.favorites,
        city: incoming.city,
        rank: incoming.rank,
        live: liveSearchParam(liveOn),
        openings: next.openings,
        cwelcc: next.cwelcc,
        inclusive: next.inclusive,
        meals: next.meals,
        subsidy: next.subsidy,
        spoken: next.spoken,
      }),
    });
  }

  function listingPageSearch(page: number) {
    return withParentSearch({
      q: incoming.q,
      name: incoming.name,
      from: incoming.from,
      to: incoming.to,
      sort: incoming.sort,
      age: incoming.age,
      start: incoming.start,
      cat: incoming.cat,
      care: incoming.care,
      favorites: incoming.favorites,
      openings: incoming.openings,
      city: incoming.city,
      rank: incoming.rank,
      live: liveSearchParam(liveOn),
      diet: dietParam || undefined,
      page: page > 1 ? page : undefined,
    });
  }

  function writeDiet(keys: CareDetailKey[]) {
    const next = careKeysParam(keys);
    setCareKeys(parseCareKeys(next));
    void navigate({
      search: {
        ...listingPageSearch(1),
        diet: next,
      },
    });
  }

  function writeParentFilters(next: ParentListingSearch) {
    void navigate({
      search: {
        q: incoming.q ?? query,
        name: incoming.name,
        from: incoming.from,
        to: incoming.to,
        sort: incoming.sort,
        age: incoming.age,
        start: incoming.start,
        cat: incoming.cat,
        care: incoming.care,
        favorites: incoming.favorites,
        openings: incoming.openings,
        live: liveSearchParam(liveOn),
        ages: undefined,
        open: undefined,
        sched: undefined,
        fac: undefined,
        ...compactParentListingSearch(next),
      },
    });
  }

  function writeLiveClaimed(on: boolean) {
    setClaimVerifiedOnly(on);
    void navigate({
      search: withParentSearch({
        q: incoming.q ?? query,
        name: incoming.name,
        from: incoming.from,
        to: incoming.to,
        sort: incoming.sort,
        age: incoming.age,
        start: incoming.start,
        cat: incoming.cat,
        care: incoming.care,
        favorites: incoming.favorites,
        openings: incoming.openings,
        city: incoming.city,
        rank: incoming.rank,
        live: on ? "1" : undefined,
      }),
    });
  }

  function noteSearch(label: string, replace?: string) {
    const prior = readRecentSearches().filter(
      (item) => !replace || item.label.toLowerCase() !== replace.trim().toLowerCase(),
    );
    const next = rememberSearch(prior, label);
    writeRecentSearches(next);
    setRecentSearches(next);
  }

  function applyPlace(place: { lat: number; lng: number; label: string }, replace?: string) {
    setOrigin({ ...place, explicit: true }, "manual");
    setQuery(place.label);
    noteSearch(place.label, replace);
    writeExploreSearch({ q: place.label, name: nameQuery, from: needBy, to: needUntil });
  }

  useEffect(() => {
    if (bootHoldUrl.current) return;
    const label = origin.label.trim();
    if (!label) return;
    if ((incoming.q || "").trim()) return;
    writeExploreSearch({ q: label, name: nameQuery, from: needBy, to: needUntil });
    // GPS, a saved city, a Canadian IP, or the Winnipeg fallback stays in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- write only when q is missing
  }, [origin.label, originSource, incoming.q]);

  function writeExploreSearch(next: { q?: string; name?: string; from?: string; to?: string }) {
    const fields = compactExploreSearch(next);
    void navigate({
      search: withParentSearch({
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
        openings: incoming.openings,
        live: liveSearchParam(liveOn),
      }),
    });
  }

  function writeNowLoopSearch(next: { age?: SearchAge | ""; start?: SearchStart | "" }) {
    const age = next.age === "" ? undefined : (next.age ?? incoming.age);
    const start = next.start === "" ? undefined : (next.start ?? incoming.start);
    const keepFacilityCat =
      incoming.cat === "home" || incoming.cat === "nursery" || incoming.cat === "before-after";
    const cat = keepFacilityCat
      ? incoming.cat
      : next.age && isExploreCategory(next.age)
        ? next.age
        : incoming.cat;
    void navigate({
      search: withParentSearch({
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
        openings: incoming.openings,
        live: liveSearchParam(liveOn),
      }),
    });
  }

  function exploreSearchPatch(next: { ages?: RailAge[]; openings?: boolean; cat?: ExploreCategory }) {
    const ages = next.ages ?? parseExploreRailAges(incoming);
    const age = formatExploreRailAges(ages);
    const openings = (next.openings ?? exploreOpeningsSelected(incoming)) ? ("1" as const) : undefined;
    const keepFacility = isFacilityExploreCategory(next.cat ?? incoming.cat);
    const cat =
      next.cat !== undefined
        ? next.cat
        : ages.length === 1
          ? ages[0]
          : keepFacility
            ? incoming.cat
            : undefined;
    return withParentSearch({
      q: (incoming.q ?? query).trim() || undefined,
      name: incoming.name,
      from: incoming.from,
      to: incoming.to,
      sort: incoming.sort,
      cat,
      age,
      start: incoming.start,
      favorites: incoming.favorites,
      openings,
      live: liveSearchParam(liveOn),
    });
  }

  function writeRailSelection(next: { ages?: RailAge[]; openings?: boolean; cat?: ExploreCategory }) {
    void navigate({ search: exploreSearchPatch(next) });
  }

  function writeBrowseType(type?: BrowseDaycareType) {
    const keepAge = incoming.cat && !isFacilityExploreCategory(incoming.cat) ? incoming.cat : undefined;
    const cat = type === "before_after" ? ("before-after" as const) : keepAge;
    const fac = type && type !== "before_after" ? type : undefined;
    void navigate({
      search: {
        ...withParentSearch({
          q: incoming.q ?? query,
          name: incoming.name,
          from: incoming.from,
          to: incoming.to,
          sort: incoming.sort,
          age: incoming.age,
          start: incoming.start,
          cat,
          care: incoming.care,
          favorites: incoming.favorites,
          openings: incoming.openings,
          live: liveSearchParam(liveOn),
        }),
        fac,
      },
    });
  }

  /** Age chips 1–4 write `?age=`. All / facility chips clear the age band. */
  function writeCategorySearch(cat?: ExploreCategory) {
    const age = cat && isRailAge(cat) ? [cat] : [];
    writeRailSelection({
      ages: age,
      cat,
      openings: cat ? exploreOpeningsSelected(incoming) : false,
    });
  }

  /** Row B age chips. Clearing age keeps a facility chip from Filters. */
  function writeAgeSearch(age?: RailAge) {
    if (!age) {
      writeRailSelection({ ages: [], openings: false, cat: isFacilityExploreCategory(incoming.cat) ? incoming.cat : undefined });
      return;
    }
    writeRailSelection({ ages: toggleExploreRailAge(parseExploreRailAges(incoming), age) });
  }

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  async function applyQuery(typed?: string) {
    const label = (typed ?? query).trim();
    if (label) {
      const hit = await resolveLocationQuery(label);
      if (hit) {
        applyPlace(hit, label);
        return;
      }
      noteSearch(label);
      const kept = (incoming.q || origin.label || "").trim();
      writeExploreSearch({
        q: kept || undefined,
        name: label,
        from: needBy,
        to: needUntil,
      });
      return;
    }
    writeExploreSearch({ q: origin.label, name: nameQuery, from: needBy, to: needUntil });
  }

  function followDevice(pos: { lat: number; lng: number; accuracyM?: number }) {
    const resolved = originFromDeviceFix(pos, origin, { timeZone: readClientTimeZone() });
    const label = resolved.source === "gps" ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
    setAnchorMode("home");
    setOrigin(
      { lat: resolved.lat, lng: resolved.lng, label, explicit: resolved.source === "gps" },
      resolved.source,
    );
    setQuery(label);
    writeExploreSearch({ q: label, name: nameQuery, from: needBy, to: needUntil });
    void hapticLight();
  }

  async function geo() {
    if (locationConsent !== "granted") {
      setAskLocation(true);
      return;
    }
    const pos = await getDeviceLocation({ precise: true });
    if (pos) followDevice(pos);
    else setLocationConsent("denied");
  }

  async function allowLocation() {
    setAskLocation(false);
    const pos = await getDeviceLocation({ precise: true });
    if (pos) {
      setLocationConsent("granted");
      followDevice(pos);
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
    setCareKeys([]);
    setWorkOrigin(null);
    setWorkQuery("");
    setAnchorMode("home");
    void navigate({
      search: {
        ...withParentSearch({
          q: incoming.q,
          name: incoming.name,
          from: incoming.from,
          to: incoming.to,
          sort: incoming.sort,
          city: incoming.city,
          rank: incoming.rank,
          start: incoming.start,
          age: undefined,
          cat: undefined,
          care: undefined,
          favorites: undefined,
          openings: undefined,
          live: undefined,
          cwelcc: undefined,
          inclusive: undefined,
          meals: undefined,
          subsidy: undefined,
          spoken: undefined,
          diet: undefined,
        }),
        fac: undefined,
        cat: undefined,
        ages: undefined,
        open: undefined,
        sched: undefined,
      },
    });
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
      startDate: needBy || null,
    };
  }

  function openSaveSearch() {
    const band: AgeBand = schoolAgeOnly ? "school-age" : ageGroup === "any" ? "any" : ageGroup;
    setSaveName(defaultSearchName(origin.label, radiusKm, band));
    setSaveOpen(true);
  }

  function submitSaveSearch() {
    if (!user) return;
    setSaveBusy(true);
    const band: AgeBand = schoolAgeOnly ? "school-age" : ageGroup === "any" ? "any" : ageGroup;
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
        confirmAction(t, "searchSaved");
        setSaveOpen(false);
        noteHappyMoment("saved_search");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("saveSearch")))
      .finally(() => setSaveBusy(false));
  }

  function widenSearchRadius() {
    const next = PRESETS_KM.find((n) => n > radiusKm) ?? MAX_SEARCH_RADIUS_KM;
    setRadiusKm(next);
  }

  function retrySearch() {
    if (!pageCanSearch) return;
    // Invalidate synchronously: a response resolving before the next effect
    // cannot overwrite the new attempt or repopulate the session cache.
    pageGate.current.invalidate();
    mapGate.current.invalidate();
    pageAbort.current?.abort();
    mapAbort.current?.abort();
    setRefreshing(true);
    setSearchFailed(false);
    if (view === "map") {
      setMapPendingKey(searchMapKey);
      setMapFailedKey(null);
    }
    setRetryRequest((previous) => ({ pageKey, mapKey: searchMapKey, attempt: (previous?.attempt ?? 0) + 1 }));
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

  // Server predicates run on the complete ranked set before pagination. Never
  // replace a filtered page with raw items or apply page-only totals here.
  const list = useMemo(() => publicListings(items ?? []), [items]);
  const selectedAges = parseExploreRailAges(incoming);
  const openingsOn = exploreOpeningsSelected(incoming);
  const searchAge =
    selectedAges.length === 1
      ? selectedAges[0]
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
  const shownList = gated ? split.primary : list;
  const resultCount = shownList.length + (gated ? split.ageUnknown.length : 0);
  const pooled = shownList;
  const railItems = nameQuery.trim() ? orderNameMatches(pooled) : preferCompleteCards(pooled);
  const visualItems = railItems.filter((row) => {
    if (
      selectedAges.length &&
      !selectedAges.some((age) => matchesRailAge(row, age) || listingAgeUnknown(row))
    ) {
      return false;
    }
    if (openingsOn && honestVacancy(row).kind !== "open") return false;
    return true;
  });
  const showSearchEmpty =
    items !== null &&
    railItems.length === 0 &&
    (!gated || split.ageUnknown.length === 0);
  const [ageUnknownOpen, setAgeUnknownOpen] = useState(false);
  useEffect(() => {
    if (gated && shownList.length === 0 && split.ageUnknown.length > 0) {
      setAgeUnknownOpen(true);
    }
  }, [gated, shownList.length, split.ageUnknown.length]);
  useEffect(() => {
    if (!gated || !searchAge || !searchStart) return;
    trackProductEvent("search_performed", {
      surface: "search",
      source: "filters",
      count_bucket: countBucket(shownList.length),
    });
    capturePostHogEvent("search_filters_applied", {
      age_band: searchAge,
      start: searchStart,
      has_place: Boolean((incoming.q || query || origin.label || "").trim()),
    });
  }, [gated, searchAge, searchStart, incoming.q, query, origin.label, shownList.length]);
  useEffect(() => {
    if (items === null) return;
    capturePostHogEvent("search_results_shown", {
      n: resultCount,
      n_age_known: shownList.length,
      n_age_unknown: split.ageUnknown.length,
    });
  }, [gated, items, shownList.length, split.ageUnknown.length, resultCount]);
  useEffect(() => {
    if (items === null) return;
    const filters = [
      ten ? "ten" : "",
      extended ? "extended" : "",
      meals ? "meals" : "",
      outdoor ? "outdoor" : "",
      infantOnly ? "infant" : "",
      openingsOn ? "openings" : "",
      rankSchedules.join("+"),
    ]
      .filter(Boolean)
      .join(",");
    publishRankingContext(visualItems, sort, rankingVariant);
    captureRankingEvent("search_performed", {
      city: rankingCity(incoming.city || cameraHome.label) || undefined,
      age_group: rankAge,
      filters,
      sort,
      result_count: visualItems.length,
      variant: rankingVariant,
    });
  }, [
    items,
    visualItems.map((row) => row.id).join(","),
    sort,
    rankingVariant,
    ten,
    extended,
    meals,
    outdoor,
    infantOnly,
    openingsOn,
    rankSchedules.join(","),
    rankAge,
    incoming.city,
    cameraHome.label,
  ]);
  const resolvedCat = resolvedExploreCategory(incoming);
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
    (careKeys.length ? 1 : 0) +
    (selectedAges.length ? 1 : 0) +
    (openingsOn ? 1 : 0) +
    (resolvedCat && !isRailAge(resolvedCat) ? 1 : 0);
  const sheetFilterCount =
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
    (favoritesOnly ? 1 : 0) +
    (careType !== "any" ? 1 : 0) +
    (isFacilityExploreCategory(resolvedExploreCategory(incoming)) ? 1 : 0) +
    (parsePioneerSearch(incoming as Record<string, unknown>).cwelcc ? 1 : 0) +
    (parsePioneerSearch(incoming as Record<string, unknown>).inclusive ? 1 : 0) +
    (parsePioneerSearch(incoming as Record<string, unknown>).meals ? 1 : 0) +
    (parsePioneerSearch(incoming as Record<string, unknown>).subsidy ? 1 : 0) +
    (parsePioneerSearch(incoming as Record<string, unknown>).spoken ? 1 : 0) +
    (workOrigin && anchorMode !== "home" ? 1 : 0);
  const anchors = viewAnchors;
  const catalog = items ?? [];
  const fabric = areaPresence(catalog);
  const dualEmpty = anchors.intersect && !searchFailed && (items?.length ?? 0) === 0;
  const iqaluitEmpty =
    !searchFailed &&
    items !== null &&
    items.length === 0 &&
    isIqaluitQuery(`${incoming.q || ""} ${incoming.city || ""} ${origin.label || ""}`);
  const needsCanada =
    Boolean(boot.needsPlace) && !requestedPlace && !(origin.label || "").trim();
  const coverage = searchCoverageCopy(resultEvidence, locale);
  const incompleteEmpty = pageCanSearch && !searchFailed && coverage.incomplete && items !== null && visualItems.length === 0;
  const emptyState = needsCanada
    ? {
        title: t("canadaSearchTitle"),
        body: t("canadaSearchLead"),
        action: t("canadaSearchChoose"),
        actionTo: "/?change=1" as string | undefined,
        onAction: undefined as (() => void) | undefined,
        secondary: undefined as string | undefined,
        secondaryTo: undefined as string | undefined,
        onSecondary: undefined as (() => void) | undefined,
      }
    : incompleteEmpty
    ? {
        title: coverage.emptyTitle,
        body: coverage.emptyDetail,
        action: coverage.retry,
        onAction: retrySearch,
        secondary: coverage.changeArea,
        secondaryTo: localePath("/?change=1", locale),
      }
    : iqaluitEmpty
    ? {
        title: t("searchIqaluitEmpty"),
        body: t("searchIqaluitEmptyLead"),
        action: t("widenRadius"),
        onAction: widenSearchRadius,
        secondary: t("changeLocation"),
        secondaryTo: "/?change=1",
        onSecondary: undefined as (() => void) | undefined,
      }
    : searchFailed
    ? {
        title: t("searchFailedTitle"),
        body: t("searchFailedLead"),
        action: t("tryAgain"),
        onAction: retrySearch,
        secondary: t("changeLocation"),
        secondaryTo: "/?change=1",
      }
    : nameQuery.trim()
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
  const whereLabel = (incoming.q || query || origin.label || cardOrigin?.origin.label || "").trim();
  const city = (whereLabel || origin.label).split(",")[0];
  const askedPlace = Boolean((incoming.q || incoming.city || "").trim());
  const locationKnown =
    askedPlace ||
    located ||
    Boolean((origin.label || "").trim()) ||
    Boolean((cardOrigin?.origin.label || "").trim()) ||
    originSource === "gps" ||
    originSource === "manual" ||
    originSource === "saved" ||
    originSource === "ip";
  const headingCity = locationKnown ? city : t("searchPlacePending");
  const whereSet = Boolean(whereLabel);
  const mapOrigin = anchors.primary;
  const nameSearch = Boolean(nameQuery.trim());
  const centreCount = resultTotal;
  const licensedCount = coverage.incomplete ? coverage.count(centreCount) : centreCount === 1
    ? t("searchLicensedCountOne") : t("searchLicensedCount").replace("{n}", String(centreCount));
  const browseHint = splitLiveBrowseHint(t("exploreBrowseHint").replace("{n}", String(fabric.live)));
  const placeBits = (whereLabel || origin.label).split(",").map((part) => part.trim());
  const browseHub = cityHubDefForPlace(placeBits[0], normalizeProvinceCode(placeBits[1]) || placeBits[1]);
  const searchCountLine = searchFailed
    ? locale === "fr" ? "La recherche n’a pas pu être actualisée" : "Search could not be refreshed"
    : coverage.incomplete ? licensedCount : licensedSearchCountLine({
    nameSearch,
    liveCount: fabric.live,
    licensed: licensedCount,
    liveHint: browseHint.count,
  });
  const showBrowseLink = Boolean(browseHub && browseHint.browse && !nameSearch && fabric.live > 0);

  function chip(on: boolean, label: string, action: () => void) {
    return (
      <ChipButton on={on} onClick={action} aria-pressed={on}>
        {label}
      </ChipButton>
    );
  }

  const shownRadius = radiusKm;
  const radiusMax = MAX_SEARCH_RADIUS_KM;
  const u = t("km");

  const radiusSlider = (
    <div data-ke="radius-km">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{t("radius")}</span>
        <span className="tabular-nums font-semibold">
          {shownRadius} {u}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={radiusMax}
        step={1}
        value={shownRadius}
        onChange={(e) => {
          setRadiusKm(Number(e.target.value));
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
        {PRESETS_KM.map((n) => (
          <ChipButton
            key={n}
            on={radiusKm === n}
            onClick={() => setRadiusKm(n)}
            aria-pressed={radiusKm === n}
          >
            {n} {u}
          </ChipButton>
        ))}
      </div>
    </div>
  );

  const filterChips = (
    <div>
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
      {chip(liveOn, t("filterClaimVerified"), () => writeLiveClaimed(!liveOn))}
      {chip(ten, t("filterTen"), () => setTen((v) => !v))}
      {fitFacts.signedIn ? (
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <span>{locale === "fr" ? "Budget mensuel" : "Monthly budget"}</span>
          <input
            inputMode="numeric"
            className="ke-input w-[7rem]"
            value={budgetMonthly}
            aria-label={locale === "fr" ? "Budget mensuel" : "Monthly budget"}
            onChange={(event) => setBudgetMonthly(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
          />
        </label>
      ) : null}
      {chip(meals, t("filterMeals"), () => setMeals((v) => !v))}
      {chip(outdoor, t("filterOutdoor"), () => setOutdoor((v) => !v))}
      {chip(inclusive, t("filterInclusive"), () => setInclusive((v) => !v))}
      {chip(extended, t("filterExtended"), () => setExtended((v) => !v))}
      {chip(infantOnly, standardAgeLabel("infant", locale), () => setInfantOnly((v) => !v))}
      {chip(catchmentOnly, t("filterCatchment"), () => setCatchmentOnly((v) => !v))}
      {chip(favoritesOnly, t("filterFavorites"), () => setFavoritesOnly((v) => !v))}
    </div>
    <InclusiveCareFilters locale={locale === "fr" ? "fr" : "en"} selected={careKeys} onChange={writeDiet} />
    <LicenceTypeFilters locale={locale === "fr" ? "fr" : "en"} selected={licence} onChange={setLicence} />
    </div>
  );

  const exploreCatCounts = countExploreCategories(catalog);
  const activeCat = resolvedExploreCategory(incoming);
  const mobileDraft = useMemo(
    () =>
      draftFromParams({
        q: incoming.q,
        from: incoming.from,
        to: incoming.to,
        age: incoming.age,
        ages: incoming.ages,
        sched: incoming.sched,
        fac: incoming.fac,
        cat: incoming.cat,
        openings: incoming.openings,
        subsidy: incoming.subsidy,
        inclusive: incoming.inclusive,
        spoken: incoming.spoken,
      }),
    [incoming],
  );
  function commitMobileSearch(params: MobileSearchParams) {
    void navigate({
      search: (previous) => mergeMobileSearchParams(previous, params),
      // SearchSheet owns the temporary history entry while it is open.
      replace: true,
    });
  }
  const mobileRows = visualItems;

  const safeNextPage = nextPage !== null && nextPage > resultPage && nextPage <= SEARCH_PAGE_MAX ? nextPage : null;
  const listingPagination = items !== null && (safeNextPage !== null || resultPage > 1 || pageLimitReached) ? (
    <nav className="mt-6 flex flex-wrap gap-3" aria-label={t("search")}>
      {resultPage > 1 ? (
        <Button asChild variant="secondary">
          <Link to={localePath("/search", locale)} search={listingPageSearch(resultPage - 1)}>
            {t("showPreviousListings")}
          </Link>
        </Button>
      ) : null}
      {safeNextPage !== null ? (
        <Button asChild variant="secondary">
          <Link to={localePath("/search", locale)} search={listingPageSearch(safeNextPage)}>
            {t("showMoreListings")}
          </Link>
        </Button>
      ) : null}
      {pageLimitReached ? (
        <div className="basis-full text-sm text-muted" role="status" data-ke="search-page-limit">
          <p>{locale === "fr" ? "Vous avez atteint la dernière page de cette recherche. La carte ou une zone plus précise peut vous aider à poursuivre." : "You’ve reached the last page of this search. Use the map or a smaller area to keep looking."}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setView("map")}>{t("map")}</Button>
            <Link to={localePath("/", locale)} search={{ change: "1" }} className="inline-flex min-h-11 items-center underline">{coverage.changeArea}</Link>
          </div>
        </div>
      ) : null}
    </nav>
  ) : null;

  return (
    <SearchCardOriginProvider value={cardOrigin}>
    <SearchCardAgesProvider ages={selectedAges}>
    <Shell>
      <div className="ke-dense ke-gutter mx-auto max-w-7xl pb-6 pt-2">
        {boot.mobileSearchV2 ? (
          <div className="contents md:hidden">
            <MobileSearchResults
              draft={mobileDraft}
              countLabel={items === null || refreshing ? t("searchCountLoading") : mobileRows.length !== visualItems.length
                ? locale === "fr" ? `${mobileRows.length} centres affichés sur cette page` : `${mobileRows.length} centres shown on this page`
                : searchCountLine}
              onCommit={commitMobileSearch}
              onFilters={() => setFilters((open) => !open)}
              filtersOpen={filters}
              filterCount={sheetFilterCount}
              mapOn={view === "map"}
              onMap={() => {
                dismissPopovers();
                setView(view === "map" ? "list" : "map");
              }}
              chips={[
                {
                  id: "open",
                  label: t("filterOpen"),
                  on: openingsOn,
                  onToggle: () => writeRailSelection({ openings: !openingsOn }),
                },
                {
                  id: "licensed",
                  label: t("msv2Licensed"),
                  on: licensedChip,
                  onToggle: () => setLicensedChip((on) => !on),
                },
                {
                  id: "subsidy",
                  label: t("msv2SubsidyChip"),
                  on: incoming.subsidy === "1",
                  onToggle: () =>
                    writePioneer({
                      ...parsePioneerSearch(incoming as Record<string, unknown>),
                      subsidy: incoming.subsidy === "1" ? undefined : "1",
                    }),
                },
                {
                  id: "infant",
                  label: t("msv2Infant"),
                  on: selectedAges.includes("infant"),
                  onToggle: () => writeAgeSearch("infant"),
                },
                {
                  id: "toddler",
                  label: t("msv2Toddler"),
                  on: selectedAges.includes("toddler"),
                  onToggle: () => writeAgeSearch("toddler"),
                },
                {
                  id: "preschool",
                  label: t("msv2Preschool"),
                  on: selectedAges.includes("preschool"),
                  onToggle: () => writeAgeSearch("preschool"),
                },
                {
                  id: "meals",
                  label: t("msv2Meals"),
                  on: incoming.meals === "1",
                  onToggle: () =>
                    writePioneer({
                      ...parsePioneerSearch(incoming as Record<string, unknown>),
                      meals: incoming.meals === "1" ? undefined : "1",
                    }),
                },
                {
                  id: "french",
                  label: t("filterFrench"),
                  on: (incoming.spoken || "").split(",").includes("fr"),
                  onToggle: () => {
                    const current = parsePioneerSearch(incoming as Record<string, unknown>);
                    const langs = (current.spoken || "").split(",").filter((part) => part && part !== "fr");
                    const has = (current.spoken || "").split(",").includes("fr");
                    writePioneer({ ...current, spoken: has ? langs.join(",") || undefined : [...langs, "fr"].join(",") });
                  },
                },
                {
                  id: "top",
                  label: t("msv2TopRated"),
                  on: topRatedChip,
                  onToggle: () => setTopRatedChip((on) => !on),
                },
              ]}
            />
          </div>
        ) : null}
        <div className={boot.mobileSearchV2 ? "max-md:hidden" : undefined}>
        <ExploreSearchBar
          className="mt-2"
          startCollapsed
          values={{ where: query, name: nameQuery, from: needBy, to: needUntil }}
          origin={origin}
          radiusKm={shownRadius}
          onRadiusChange={setRadiusKm}
          start={searchStart ?? ""}
          childSummary={selectedAges.map((age) => t(EXPLORE_AGE_RAIL_COPY[age])).join(", ")}
          childAges={RAIL_AGES.map((age) => ({
            id: age,
            label: t(EXPLORE_AGE_RAIL_COPY[age]),
            on: selectedAges.includes(age),
          }))}
          onChildAge={(id) => {
            if (isRailAge(id)) writeAgeSearch(id);
          }}
          onWhereChange={setQuery}
          onWhereResolved={applyPlace}
          onNameChange={setNameQuery}
          onDatesChange={({ from, to }) => {
            setNeedBy(from);
            setNeedUntil(to);
          }}
          onStartChange={(start) => writeNowLoopSearch({ start })}
          onLocate={() => void geo()}
          onSubmit={(typed) => void applyQuery(typed)}
        />
        <div className="mt-1 flex flex-wrap items-start gap-x-4">
        {recentSearches.length ? (
          <details data-ke="recent-searches">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-muted">{t("recentSearches")}</summary>
            <div className="mt-1 flex flex-wrap gap-2">
              {recentSearches.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="inline-flex min-h-11 max-w-full items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border"
                  onClick={() => void applyQuery(item.label)}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
        <SmartMatchEntry inline quiet />
        </div>
        </div>
        <div className={cn("mt-2 flex items-end justify-between gap-3 max-md:flex-wrap max-md:gap-y-1", boot.mobileSearchV2 && "max-md:hidden")}>
          <div className="min-w-0 max-md:max-w-full max-md:flex-1 max-md:basis-[min(100%,12rem)]">
            <h1
              className="font-display text-[1.35rem] leading-tight tracking-[-0.03em] text-balance max-md:break-words"
              data-search-h1=""
            >
              {parentFilters.fac.length === 1
                ? t(BROWSE_RAIL_COPY[parentFilters.fac[0]])
                : incoming.cat === "before-after"
                  ? t(BROWSE_RAIL_COPY.before_after)
                  : headingCity}
            </h1>
            <p className="mt-0.5 min-h-5 text-sm text-muted text-balance" aria-live="polite" data-ke="search-count">
              {items === null || refreshing ? (
                <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                  <span className="ke-skel inline-block h-3.5 w-28" aria-hidden="true" />
                  <span>{t("searchCountLoading")}</span>
                </span>
              ) : (
                <>
                  {(parentFilters.fac.length === 1 || incoming.cat === "before-after") && locationKnown
                    ? `${city} · `
                    : ""}
                  {searchCountLine}
                  {showBrowseLink && browseHub ? (
                    <>
                      {" · "}
                      <Link
                        to={localePath(cityHubPath(browseHub.slug), locale)}
                        data-ke="browse-directory"
                        className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        {browseHint.browse}
                      </Link>
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <Link
            to="/need-care-fast"
            search={{ q: locationKnown ? String(city || "").trim().slice(0, 80) : "" }}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("needCareFast")}
          </Link>
        </div>
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
              {origin.label} · {shownRadius} {u} · {ageGroup === "any" ? t("anyAge") : standardAgeLabel(ageGroup, locale)}
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


        {items !== null && pageCanSearch && (searchFailed || coverage.incomplete) ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" role="status" data-ke="search-coverage" data-coverage={searchFailed ? "error" : coverage.evidence.status}>
            <span>{searchFailed
              ? locale === "fr" ? "Les résultats n’ont pas pu être actualisés. Les fiches affichées peuvent ne plus être à jour." : "Results could not be refreshed. Any listings shown may be out of date."
              : coverage.detail}</span>
            {visualItems.length > 0 ? <>
              <Button type="button" variant="secondary" size="sm" onClick={retrySearch} disabled={refreshing}>{coverage.retry}</Button>
              <Link to={localePath("/", locale)} search={{ change: "1" }} className="inline-flex min-h-11 items-center underline">{coverage.changeArea}</Link>
            </> : null}
          </div>
        ) : null}

        <div className="ke-explore-filter-sticky mt-3" data-msv2-hide={boot.mobileSearchV2 ? "mobile" : undefined}>
        <ExploreFilterBar
          listingCount={items !== null ? resultCount : undefined}
          liveOn={liveOn}
          onLive={() => writeLiveClaimed(!liveOn)}
          liveSearch={{ ...exploreSearchPatch({}), live: liveSearchParam(!liveOn) }}
          ageChips={
            <ExploreCategoryChips
              selected={selectedAges}
              counts={exploreCatCounts}
              searchFor={(cat) =>
                cat
                  ? exploreSearchPatch({ ages: toggleExploreRailAge(selectedAges, cat) })
                  : exploreSearchPatch({
                      ages: [],
                      openings: false,
                      cat: isFacilityExploreCategory(incoming.cat) ? incoming.cat : undefined,
                    })
              }
              onSelect={(cat) => writeAgeSearch(cat && isRailAge(cat) ? cat : undefined)}
            />
          }
          nearMeOn={originSource === "gps" && anchorMode === "home"}
          onNearMe={() => {
            setAnchorMode("home");
            void geo();
          }}
          openSpotsOn={openingsOn}
          openSpotsSearch={exploreSearchPatch({ openings: !openingsOn })}
          onOpenSpots={() => writeRailSelection({ openings: !openingsOn })}
          tenOn={ten}
          onTen={() => setTen((v) => !v)}
          filtersOpen={filters}
          filterCount={sheetFilterCount}
          onFilters={() => setFilters((v) => !v)}
          mapOn={view === "map"}
          onMap={() => {
            dismissPopovers();
            setView(view === "map" ? "list" : "map");
          }}
        />
        </div>
        {!filters && sheetFilterCount > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-ke="filters-applied">
            <span>{locale === "fr" ? `Filtres appliqués · ${sheetFilterCount}` : `Filters applied · ${sheetFilterCount}`}</span>
            <button type="button" className="min-h-11 font-medium text-primary" onClick={clearListingFilters}>
              {locale === "fr" ? "Tout effacer" : "Clear all"}
            </button>
          </p>
        ) : null}

        {askLocation ? (
          <div className="mt-3">
            <LocationConsentCard
              onAllow={() => void allowLocation()}
              onLater={() => setAskLocation(false)}
            />
          </div>
        ) : null}

        {filters ? (
          <div
            id="search-filters"
            role="region"
            aria-labelledby="search-filters-title"
            className="mt-3 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border"
            data-ke="explore-filters-sheet"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="search-filters-title" tabIndex={-1} className="scroll-mt-64 text-sm font-semibold outline-none md:scroll-mt-36">{t("filters")}</h2>
              <div className="flex items-center gap-2">
                <ChipButton onClick={clearListingFilters}>{locale === "fr" ? "Tout effacer" : "Clear all"}</ChipButton>
                <ChipButton onClick={closeFilters}>{t("close")}</ChipButton>
              </div>
            </div>
            <PioneerFilterRail value={parsePioneerSearch(incoming as Record<string, unknown>)} onChange={writePioneer} />
            <CommuteDetourBar />
            <div className="flex items-center justify-end gap-3">
              {user ? (
                <ChipButton onClick={openSaveSearch}>{t("saveSearch")}</ChipButton>
              ) : (
                  <Link
                    to={locale === "fr" ? "/fr/login" : "/login"}
                    search={parentSignupSearch(localePath("/search", locale), "alerts")}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                    onClick={() => {
                      capturePostHogEvent(
                        SIGNUP_FUNNEL_EVENT,
                        signupFunnelPayload(signupPromptStep("alerts"), { source: "listing" }),
                      );
                    }}
                  >
                    {t("signupWhyAlerts")}
                  </Link>
                )}
            </div>
            <div data-ke="near-work">
              <p className="text-sm font-medium">{t("nearWork")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("nearWorkLead")}</p>
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
            </div>
            {anchors.mode === "both" && workOrigin ? (
              <p className="text-xs text-muted" data-ke="anchor-both-hint">
                {t("anchorBothHint").replace("{n}", String(shownRadius)).replace("{u}", u)}
              </p>
            ) : anchors.mode === "work" && workOrigin ? (
              <p className="text-xs text-muted">{t("anchorWorkHint")}</p>
            ) : null}
            {(["home", "nursery", "before-after"] as const).some(
              (cat) => exploreCatCounts[cat] > 0 || activeCat === cat,
            ) ? (
              <div>
                <p className="mb-2 text-sm font-medium">{t("exploreFacilityTypes")}</p>
                <div className="flex flex-wrap gap-2">
                  {(["home", "nursery", "before-after"] as const)
                    .filter((cat) => exploreCatCounts[cat] > 0 || activeCat === cat)
                    .map((cat) => (
                      <ChipButton
                        key={cat}
                        on={activeCat === cat}
                        aria-pressed={activeCat === cat}
                        onClick={() => writeCategorySearch(activeCat === cat ? undefined : cat)}
                      >
                        {t(EXPLORE_CATEGORY_COPY[cat])}
                      </ChipButton>
                    ))}
                </div>
              </div>
            ) : null}
            <ExploreFilterChips
              value={parentFilters}
              visible={visibleParentChipOptions(items ?? [])}
              hideKeys={["ages"]}
              onApply={writeParentFilters}
            />
            {filterChips}
            {radiusSlider}
            <div className="flex flex-wrap gap-2" data-ke="sort-row">
              {(
                [
                  ...(showBestMatch ? [["best", t("sortBest")] as [SortKey, string]] : []),
                  ["distance", showBestMatch ? t("sortNearest") : t("sortDistance")],
                  ...(showBestMatch ? [] : [["match", t("sortMatch")] as [SortKey, string]]),
                  ["urgency", t("sortUrgency")],
                  ["recommended", t("sortRecommended")],
                  ["price", t("sortPrice")],
                  ["rating", t("sortRating")],
                  ["availability", t("sortOpen")],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <ChipButton
                  key={k}
                  on={sort === k}
                  aria-pressed={sort === k}
                  data-ke={k === "best" ? "sort-best" : k === "distance" && showBestMatch ? "sort-nearest" : undefined}
                  onClick={() => pickSort(k)}
                >
                  {label}
                </ChipButton>
              ))}
            </div>
            {sort === "best" ? <p className="text-xs text-muted">{t("sortBestLead")}</p> : null}
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

        {boot.mobileSearchV2 ? (
          <div className="md:hidden" data-ke="msv2-split">
            {view === "map" ? (
              storeChannel === "huawei" ? (
                <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-border"><StoreMapFallback /></div>
              ) : mapEnabled ? (
                <div className="mt-3 space-y-2">
                {mapStatus}
                <div className="h-[46dvh] min-h-52 overflow-hidden rounded-2xl ring-1 ring-border" data-ke="msv2-map">
                  <Suspense fallback={<div className="ke-skel size-full" aria-hidden="true" />}>
                    <MapView
                      items={mobileRows}
                      searchPins={searchMapPins}
                      origin={mapOrigin}
                      placeLabel={whereLabel || origin.label}
                      secondOrigin={anchors.intersect && workOrigin ? workOrigin : null}
                      radiusKm={radiusKm}
                      activeSlug={active}
                      onSelect={(slug) => setActive(slug)}
                      onRelocate={(pos) => followDevice(pos)}
                      onLocate={() => void geo()}
                      onFallback={() => setView("list")}
                    />
                  </Suspense>
                </div>
                </div>
              ) : null
            ) : null}
            <div data-ke="msv2-list" className="mt-3 min-w-0 bg-bg pb-6">
              {items === null ? <p className="px-1 text-sm text-muted">{t("searchCountLoading")}</p> : mobileRows.length === 0 ? (
                <EmptyState
                  title={emptyState.title}
                  body={emptyState.body}
                  action={emptyState.action}
                  actionTo={"actionTo" in emptyState ? emptyState.actionTo : undefined}
                  onAction={emptyState.onAction}
                  secondary={emptyState.secondary}
                  onSecondary={emptyState.onSecondary}
                  secondaryTo={emptyState.secondaryTo}
                />
              ) : (
                <DaycareTypeRails
                  items={mobileRows}
                  visual
                  eagerThumbs
                  labelFar={nameSearch}
                  skipLiveLooking
                  ratingFloor={boot.reviewRatingFloor}
                  seeAll={false}
                  layout="stack"
                />
              )}
              <div data-ke="mobile-search-pagination">{listingPagination}</div>
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "ke-search-results relative z-0 mt-2 contain-layout",
            view !== "map" && "min-h-[10rem]",
            refreshing && "opacity-70",
            boot.mobileSearchV2 && "max-md:hidden",
          )}
        >
          {view === "map" ? (
            storeChannel === "huawei" ? (
              <div className="mt-4 h-[min(72dvh,36rem)] min-h-[18rem] overflow-hidden rounded-[14px] shadow-card ring-1 ring-border lg:h-[min(62vh,34rem)]">
                <StoreMapFallback />
              </div>
            ) : mapEnabled ? (
              <div className="mt-4 space-y-3">
                {mapStatus}
                <div className="h-[min(72dvh,36rem)] min-h-[18rem] overflow-hidden rounded-[14px] shadow-card ring-1 ring-border lg:h-[min(62vh,34rem)]">
                  <Suspense fallback={<div className="ke-skel size-full" aria-hidden="true" />}>
                    <MapView
                      items={shownList}
                      searchPins={searchMapPins}
                      origin={mapOrigin}
                      placeLabel={whereLabel || origin.label}
                      secondOrigin={anchors.intersect && workOrigin ? workOrigin : null}
                      radiusKm={radiusKm}
                      activeSlug={active}
                      onSelect={(slug) => setActive(slug)}
                      onRelocate={(pos) => followDevice(pos)}
                      onLocate={() => void geo()}
                      onFallback={() => setView("list")}
                    />
                  </Suspense>
                </div>
                {items !== null && showSearchEmpty ? (
                  <div className="rounded-xl bg-surface ring-1 ring-border">
                    <EmptyState
                      title={emptyState.title}
                      body={emptyState.body}
                      action={emptyState.action}
                      actionTo={"actionTo" in emptyState ? emptyState.actionTo : undefined}
                      onAction={emptyState.onAction}
                      secondary={emptyState.secondary}
                      onSecondary={emptyState.onSecondary}
                      secondaryTo={emptyState.secondaryTo}
                    />
                  </div>
                ) : null}
              </div>
            ) : null
          ) : items === null ? (
            <div className="ke-result-stack" aria-busy="true" aria-label={t("searchCountLoading")}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2" aria-hidden="true">
                  <div className="ke-skel ke-card-photo w-full rounded-[14px]" />
                  <div className="ke-skel h-4 w-3/5" />
                  <div className="ke-skel h-3 w-2/5" />
                </div>
              ))}
            </div>
          ) : showSearchEmpty || visualItems.length === 0 ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-surface ring-1 ring-border">
                <EmptyState
                  title={emptyState.title}
                  body={emptyState.body}
                  action={emptyState.action}
                  actionTo={"actionTo" in emptyState ? emptyState.actionTo : undefined}
                  onAction={emptyState.onAction}
                  secondary={emptyState.secondary}
                  onSecondary={emptyState.onSecondary}
                  secondaryTo={emptyState.secondaryTo}
                />
              </div>
              {whereSet ? <CityHubLinks className="mt-4" headingKey="otherCities" /> : null}
            </div>
          ) : (
            <div
              data-ke="search-result-list"
              data-ke-layout="guest-stack"
              onMouseOver={(e) => {
                const node = (e.target as HTMLElement).closest("[data-slug]");
                const slug = node?.getAttribute("data-slug");
                if (slug) setActive(slug);
              }}
            >
              <DaycareTypeRails
                items={visualItems}
                visual
                eagerThumbs
                labelFar={nameSearch}
                skipLiveLooking
                ratingFloor={boot.reviewRatingFloor}
                seeAll={false}
                layout="stack"
                selected={
                  parentFilters.fac.length === 1
                    ? parentFilters.fac[0]
                    : incoming.cat === "before-after"
                      ? "before_after"
                      : undefined
                }
                onSelect={writeBrowseType}
              />
            </div>
          )}
          <ParentHelperPanel collapsed />
          {listingPagination}
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
                <div className="ke-result-stack mt-4">
                  {split.ageUnknown.map((item) => (
                    <DaycareCard key={item.id} item={item} presentation="visual" ratingFloor={boot.reviewRatingFloor} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <details className="mt-6 rounded-xl bg-surface px-3 ring-1 ring-border" data-ke="area-waitlist">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
            {locale === "fr" ? "Liste d’attente du quartier" : "Area waitlist"}
          </summary>
          <AreaWaitlistForm returnTo={localePath("/search", locale)} />
        </details>
      </div>
      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
    </Shell>
    </SearchCardAgesProvider>
    </SearchCardOriginProvider>
  );
}
