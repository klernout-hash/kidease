import { createFileRoute, Link } from "@tanstack/react-router";
import { LocateFixed, SlidersHorizontal, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ExploreRails } from "@/components/explore-rails";
import { searchDaycares } from "@/lib/server/daycares";
import { matchCentres } from "@/lib/server/ai";
import { reverseGeocode } from "@/lib/geo";
import { bootSearchOrigin } from "@/lib/search-origin";
import { fsaOf, MAX_SEARCH_RADIUS_KM } from "@/lib/proximity";
import { areaPresence, presenceFreshness } from "@/lib/presence";
import { readSearchCache, searchCacheKey, writeSearchCache } from "@/lib/search-cache";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useLivePresence } from "@/lib/use-presence";
import { trackLocation } from "@/lib/telemetry";
import { useAppStore, type SortKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { cwelccKind, hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { EmptyState } from "@/components/empty-state";
import { LocationConsentCard } from "@/components/location-consent";
import { PlaceSearch, resolveLocationQuery } from "@/components/place-search";
import { kmToMi, MAX_RADIUS_MI, miToKm, type DistanceUnit } from "@/lib/units";
import type { AgeGroup, DaycareCard as Card } from "@/lib/types";

const MapView = lazy(() => import("@/components/map-view").then((m) => ({ default: m.MapView })));
const CompareBar = lazy(() => import("@/components/compare-bar").then((m) => ({ default: m.CompareBar })));

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => {
    const q = typeof s.q === "string" ? s.q : "";
    return q ? { q } : {};
  },
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
  const incoming = Route.useSearch();
  const origin = useAppStore((s) => s.origin);
  const setOrigin = useAppStore((s) => s.setOrigin);
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
  const [items, setItems] = useState<Card[] | null>(null);
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
    void bootSearchOrigin(incoming.q);
  }, [incoming.q]);

  useEffect(() => {
    if (radiusKm > MAX_SEARCH_RADIUS_KM) setRadiusKm(MAX_SEARCH_RADIUS_KM);
  }, [radiusKm, setRadiusKm]);

  useEffect(() => {
    let live = true;
    const key = searchCacheKey({ lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup });
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
        data: { lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup, fsa: fsaOf(query) || fsaOf(origin.label) },
      })
        .then((rows) => {
          if (!live) return;
          setItems(rows);
          setSearchFailed(false);
          writeSearchCache(key, rows);
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
  }, [origin.lat, origin.lng, radiusKm, sort, ageGroup, query, origin.label]);

  function applyPlace(place: { lat: number; lng: number; label: string }) {
    setOrigin(place);
    setQuery(place.label);
  }

  async function applyQuery() {
    const hit = await resolveLocationQuery(query);
    if (hit) applyPlace(hit);
  }

  async function geo() {
    if (locationConsent !== "granted") {
      setAskLocation(true);
      return;
    }
    const pos = await getDeviceLocation({ precise: true });
    if (pos) {
      setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }, "gps");
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
      setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }, "gps");
      void hapticLight();
    } else {
      setLocationConsent("denied");
    }
  }

  function retrySearch() {
    setItems(null);
    setSearchFailed(false);
    setRefreshing(true);
    void searchDaycares({
      data: { lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup, fsa: fsaOf(query) || fsaOf(origin.label) },
    })
      .then((rows) => {
        setItems(rows);
        setSearchFailed(false);
        writeSearchCache(searchCacheKey({ lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup }), rows);
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
    } finally {
      setMatchBusy(false);
    }
  }

  const list = useMemo(() => {
    let rows = items ?? [];
    if (liveOnly) rows = rows.filter((r) => r.live);
    if (avail === "open") rows = rows.filter((r) => r.availabilityKnown && r.spotsTotal > 0);
    if (avail === "waitlist") rows = rows.filter((r) => r.availabilityKnown && r.spotsTotal <= 0);
    if (avail === "unknown") rows = rows.filter((r) => !r.availabilityKnown);
    if (ten) rows = rows.filter((r) => cwelccKind(r.province) !== "ask" || hasAmenity(r.amenities, "ten-a-day") || hasAmenity(r.amenities, "funded"));
    if (meals) rows = rows.filter((r) => hasAmenity(r.amenities, "meals"));
    if (outdoor) rows = rows.filter((r) => hasAmenity(r.amenities, "outdoor") || hasAmenity(r.amenities, "yard"));
    if (inclusive) rows = rows.filter((r) => hasAmenity(r.amenities, "inclusive"));
    if (extended) rows = rows.filter((r) => staysLate(r.hours, r.amenities) || opensEarly(r.hours));
    if (infantOnly) rows = rows.filter((r) => r.agesKnown && r.ageMinMonths <= 18);
    if (catchmentOnly) rows = rows.filter((r) => r.inCatchment);
    return rows;
  }, [items, liveOnly, avail, ten, meals, outdoor, inclusive, extended, infantOnly, catchmentOnly]);
  const extraFilters =
    (avail !== "any" ? 1 : 0) +
    (ten ? 1 : 0) +
    (meals ? 1 : 0) +
    (outdoor ? 1 : 0) +
    (inclusive ? 1 : 0) +
    (extended ? 1 : 0) +
    (infantOnly ? 1 : 0) +
    (catchmentOnly ? 1 : 0) +
    (ageGroup !== "any" ? 1 : 0);
  const city = origin.label.split(",")[0];
  const fabric = areaPresence(list);
  const freshness = presenceFreshness(originAt, originSource);

  function chip(on: boolean, label: string, action: () => void) {
    return (
      <button
        type="button"
        onClick={action}
        className={cn(
          "min-h-11 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1",
          on ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
        )}
      >
        {label}
      </button>
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
          className={cn("flex-1 text-sm font-semibold", distanceUnit === "km" ? "bg-fg text-bg" : "text-muted")}
        >
          {t("unitsKm")}
        </button>
        <button
          type="button"
          onClick={() => setDistanceUnit("mi")}
          className={cn("flex-1 text-sm font-semibold", distanceUnit === "mi" ? "bg-fg text-bg" : "text-muted")}
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
            <button
              key={n}
              type="button"
              onClick={() => setRadiusKm(distanceUnit === "mi" ? miToKm(n) : n)}
              className={cn("rounded-full px-3 py-1 text-xs ring-1", current === n ? "bg-fg text-bg ring-fg" : "ring-border")}
            >
              {n} {u}
            </button>
          );
        })}
      </div>
    </div>
  );

  const filterChips = (
    <div className="flex flex-wrap gap-2">
      {chip(avail === "open", t("filterOpen"), () => setAvail((v) => (v === "open" ? "any" : "open")))}
      {chip(avail === "waitlist", t("filterWaitlist"), () => setAvail((v) => (v === "waitlist" ? "any" : "waitlist")))}
      {chip(avail === "unknown", t("filterUnknown"), () => setAvail((v) => (v === "unknown" ? "any" : "unknown")))}
      {chip(ten, t("filterTen"), () => setTen((v) => !v))}
      {chip(meals, t("filterMeals"), () => setMeals((v) => !v))}
      {chip(outdoor, t("filterOutdoor"), () => setOutdoor((v) => !v))}
      {chip(inclusive, t("filterInclusive"), () => setInclusive((v) => !v))}
      {chip(extended, t("filterExtended"), () => setExtended((v) => !v))}
      {chip(infantOnly, t("filterInfant"), () => setInfantOnly((v) => !v))}
      {chip(catchmentOnly, t("filterCatchment"), () => setCatchmentOnly((v) => !v))}
    </div>
  );

  return (
    <Shell>
      <div className="ke-gutter mx-auto max-w-7xl pb-10 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.65rem] leading-tight tracking-[-0.03em]">{city}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {list.length} {list.length === 1 ? "centre" : "centres"}
              {DOT}
              {shownRadius} {u}
              {DOT}
              {freshness === "live" ? t("presenceLive") : freshness === "fresh" ? t("presenceFresh") : t("presenceStale")}
            </p>
            {fabric.live > 0 ? (
              <p className="mt-1 text-xs font-medium text-ok">{t("liveInArea").replace("{n}", String(fabric.live))}</p>
            ) : null}
          </div>
          <Link to="/" search={{ change: "1" }} className="shrink-0 pb-0.5 text-sm font-medium text-primary">
            {t("changeLocation")}
          </Link>
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void applyQuery();
          }}
        >
          <div className="flex min-h-12 items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 shadow-card ring-1 ring-border">
            <PlaceSearch
              value={query}
              onChange={setQuery}
              onResolved={applyPlace}
              placeholder={t("locationPh")}
              origin={origin}
              inputClassName="h-11 min-w-0 w-full bg-transparent text-[15px] outline-none"
            />
            <button type="button" onClick={() => void geo()} className="grid size-11 place-items-center text-muted" aria-label={t("useLocation")}>
              <LocateFixed className="size-5" />
            </button>
            <Button type="submit" className="h-11 rounded-full px-5">
              {t("search")}
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-h-11 min-w-[13.5rem] flex-1 rounded-full bg-surface p-0.5 ring-1 ring-border sm:flex-none">
            <button
              type="button"
              onClick={() => setLiveOnly(true)}
              className={cn("flex-1 rounded-full px-4 text-[13px] font-semibold", liveOnly ? "bg-ok text-primary-fg" : "text-muted")}
            >
              {t("liveOnly")}
            </button>
            <button
              type="button"
              onClick={() => setLiveOnly(false)}
              className={cn("flex-1 rounded-full px-4 text-[13px] font-semibold", !liveOnly ? "bg-fg text-bg" : "text-muted")}
            >
              {t("showAll")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFilters((v) => !v)}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold ring-1",
              filters || extraFilters ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            {t("filters")}
            {extraFilters ? <span className="grid size-4 place-items-center rounded-full bg-bg text-[10px] text-fg">{extraFilters}</span> : null}
          </button>
          <div className="flex h-11 min-w-[10rem] flex-1 rounded-full bg-surface p-0.5 ring-1 ring-border sm:flex-none">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn("flex-1 rounded-full px-4 text-[13px] font-semibold", view === "list" ? "bg-fg text-bg" : "text-muted")}
            >
              {t("explore")}
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={cn("flex-1 rounded-full px-4 text-[13px] font-semibold", view === "map" ? "bg-fg text-bg" : "text-muted")}
            >
              {t("map")}
            </button>
          </div>
        </div>

        {askLocation ? (
          <div className="mt-3">
            <LocationConsentCard onAllow={() => void allowLocation()} onLater={() => setAskLocation(false)} />
          </div>
        ) : null}

        {filters ? (
          <div className="mt-3 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("filters")}</p>
              <button
                type="button"
                onClick={() => setFilters(false)}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-muted hover:text-fg"
              >
                {t("close")}
              </button>
            </div>
            {filterChips}
            {radiusSlider}
            <div className="flex flex-wrap gap-2">
              {(["any", "infant", "toddler", "preschool"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgeGroup(a === "any" ? "any" : (a as AgeGroup))}
                  className={cn("min-h-11 rounded-full px-3 py-1.5 text-sm ring-1", ageGroup === a ? "bg-fg text-bg ring-fg" : "ring-border")}
                >
                  {a === "any" ? t("anyAge") : t(a)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["distance", t("sortDistance")],
                  ["price", t("sortPrice")],
                  ["rating", t("sortRating")],
                  ["availability", t("sortOpen")],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSort(k)}
                  className={cn("min-h-11 rounded-full px-3 py-1.5 text-sm ring-1", sort === k ? "bg-fg text-bg ring-fg" : "ring-border")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label className="inline-flex items-center gap-1.5 text-sm font-medium text-fg">
                <Sparkles className="size-4" />
                {t("match")}
              </label>
              <textarea value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("matchPh")} rows={2} className="ke-textarea mt-2 min-h-[4.5rem]" />
              <Button type="button" className="mt-3" disabled={matchBusy || !need.trim()} onClick={() => void runMatch()}>
                {t("matchGo")}
              </Button>
              {matchNote ? <p className="mt-3 text-sm text-muted">{matchNote}</p> : null}
            </div>
          </div>
        ) : null}

        <div className={cn("mt-2", refreshing && "opacity-70")}>
          {view === "map" ? (
            mapEnabled ? (
              <div className="mt-4 space-y-3">
                <div className="h-[62dvh] min-h-[18rem] overflow-hidden rounded-xl shadow-card ring-1 ring-border lg:h-[70vh]">
                  <Suspense fallback={<div className="size-full bg-map" />}>
                    <MapView
                      items={list}
                      origin={origin}
                      radiusKm={radiusKm}
                      activeSlug={active}
                      onSelect={(slug) => setActive(slug)}
                      onRelocate={(pos) => {
                        setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }, "gps");
                        void hapticLight();
                      }}
                      onLocate={() => void geo()}
                    />
                  </Suspense>
                </div>
                {items !== null && list.length === 0 ? (
                  <div className="rounded-xl bg-surface ring-1 ring-border">
                    <EmptyState
                      title={searchFailed ? t("noResults") : liveOnly && (items?.length ?? 0) > 0 ? t("noLiveResults") : t("emptyMap")}
                      action={searchFailed ? t("tryAgain") : liveOnly && (items?.length ?? 0) > 0 ? t("showAll") : t("changeLocation")}
                      onAction={
                        searchFailed
                          ? retrySearch
                          : liveOnly && (items?.length ?? 0) > 0
                            ? () => setLiveOnly(false)
                            : undefined
                      }
                      actionTo={searchFailed || (liveOnly && (items?.length ?? 0) > 0) ? undefined : "/?change=1"}
                    />
                  </div>
                ) : null}
              </div>
            ) : null
          ) : items === null ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2" aria-hidden="true">
                  <div className="ke-skel aspect-[20/19] w-full" />
                  <div className="ke-skel h-3.5 w-4/5" />
                  <div className="ke-skel h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="mt-6 rounded-xl bg-surface ring-1 ring-border">
              <EmptyState
                title={searchFailed ? t("noResults") : liveOnly && (items?.length ?? 0) > 0 ? t("noLiveResults") : t("noResults")}
                action={searchFailed ? t("tryAgain") : liveOnly && (items?.length ?? 0) > 0 ? t("showAll") : t("changeLocation")}
                onAction={
                  searchFailed
                    ? retrySearch
                    : liveOnly && (items?.length ?? 0) > 0
                      ? () => setLiveOnly(false)
                      : undefined
                }
                actionTo={searchFailed || (liveOnly && (items?.length ?? 0) > 0) ? undefined : "/?change=1"}
              />
            </div>
          ) : (
            <ExploreRails items={list} onHover={setActive} />
          )}
        </div>
      </div>
      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
    </Shell>
  );
}
