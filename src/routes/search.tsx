import { createFileRoute, Link } from "@tanstack/react-router";
import { LocateFixed, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { DaycareCard } from "@/components/daycare-card";
import { MapView } from "@/components/map-view";
import { Button } from "@/components/ui/button";
import { searchDaycares } from "@/lib/server/daycares";
import { matchCentres } from "@/lib/server/ai";
import { geocode, reverseGeocode } from "@/lib/geo";
import { fsaOf } from "@/lib/proximity";
import { areaPresence, presenceFreshness } from "@/lib/presence";
import { readSearchCache, searchCacheKey, writeSearchCache } from "@/lib/search-cache";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useLivePresence } from "@/lib/use-presence";
import { trackLocation } from "@/lib/telemetry";
import { useAppStore, type SortKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { cwelccKind, hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { CompareBar } from "@/components/compare-bar";
import { ExploreSheet, type SheetSnap } from "@/components/explore-sheet";
import type { AgeGroup, DaycareCard as Card } from "@/lib/types";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => {
    const q = typeof s.q === "string" ? s.q : "";
    return q ? { q } : {};
  },
  component: SearchPage,
});

const PRESETS = [5, 10, 15, 25, 50, 75];
const DOT = " \u00b7 ";

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
  const [items, setItems] = useState<Card[] | null>(() =>
    readSearchCache(
      searchCacheKey({
        lat: useAppStore.getState().origin.lat,
        lng: useAppStore.getState().origin.lng,
        radiusKm: useAppStore.getState().radiusKm,
        sort: useAppStore.getState().sort,
        ageGroup: useAppStore.getState().ageGroup,
      }),
    ),
  );
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
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const originAt = useAppStore((s) => s.originAt);
  const originSource = useAppStore((s) => s.originSource);
  useLivePresence(true);

  useEffect(() => {
    if (incoming.q) {
      const hit = geocode(incoming.q);
      if (hit) setOrigin(hit);
      setQuery(incoming.q);
    }
  }, [incoming.q, setOrigin, setQuery]);

  useEffect(() => {
    let live = true;
    const key = searchCacheKey({ lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup });
    const cached = readSearchCache(key);
    if (cached) setItems(cached);
    else setRefreshing(true);
    void searchDaycares({
      data: { lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup, fsa: fsaOf(query) || fsaOf(origin.label) },
    })
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        writeSearchCache(key, rows);
      })
      .catch(() => {
        if (live && !cached) setItems([]);
      })
      .finally(() => {
        if (live) setRefreshing(false);
      });
    trackLocation("search", origin.lat, origin.lng, origin.label, { radiusKm });
    return () => {
      live = false;
    };
  }, [origin.lat, origin.lng, radiusKm, sort, ageGroup, query]);

  function applyQuery() {
    const hit = geocode(query);
    if (hit) setOrigin(hit);
  }

  async function geo() {
    const pos = await getDeviceLocation();
    if (pos) {
      setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }, "gps");
      void hapticLight();
    }
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
    if (avail === "open") rows = rows.filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal > 0);
    if (avail === "waitlist") rows = rows.filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal <= 0);
    if (avail === "unknown") rows = rows.filter((r) => !r.live && !r.availabilityKnown);
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
          "rounded-full px-3.5 py-1.5 text-sm font-medium ring-1",
          on ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <Shell>
      <div className="relative lg:hidden">
        <div className="h-[calc(100dvh-9.5rem)] overflow-hidden bg-map">
          <MapView
            items={list}
            origin={origin}
            radiusKm={radiusKm}
            activeSlug={active}
            onSelect={(slug) => {
              setActive(slug);
              setSnap("mid");
            }}
            onRelocate={(pos) => {
              setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }, "gps");
              void hapticLight();
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
          <form
            className="pointer-events-auto"
            onSubmit={(e) => {
              e.preventDefault();
              applyQuery();
            }}
          >
            <div className="flex min-h-12 items-center gap-2 rounded-full bg-surface/95 pl-4 pr-1.5 shadow-lift ring-1 ring-border backdrop-blur">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("locationPh")}
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <button type="button" onClick={() => void geo()} className="grid size-10 place-items-center text-muted" aria-label={t("useLocation")}>
                <LocateFixed className="size-5" />
              </button>
            </div>
          </form>
        </div>
        <ExploreSheet
          snap={snap}
          onSnap={setSnap}
          label={`${list.length} · ${radiusKm} ${t("km")}`}
        >
          {items === null ? (
            <div className="ke-listings-narrow">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">{t("noResults")}</p>
          ) : (
            <div className={cn("ke-listings-narrow", refreshing && "opacity-70")}>
              {list.map((item) => (
                <div key={item.id} onClick={() => setActive(item.slug)}>
                  <DaycareCard item={item} />
                </div>
              ))}
            </div>
          )}
        </ExploreSheet>
      </div>

      <div className="ke-gutter mx-auto hidden max-w-7xl pb-6 pt-4 lg:block">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.65rem] leading-tight tracking-[-0.03em]">{city}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {list.length} {list.length === 1 ? "centre" : "centres"}
              {DOT}
              {radiusKm} {t("km")}
              {DOT}
              {freshness === "live" ? t("presenceLive") : freshness === "fresh" ? t("presenceFresh") : t("presenceStale")}
            </p>
            {fabric.live > 0 ? (
              <p className="mt-1 text-xs font-medium text-ok">
                {t("liveInArea").replace("{n}", String(fabric.live))}
              </p>
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
            applyQuery();
          }}
        >
          <div className="flex min-h-12 items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 shadow-card ring-1 ring-border">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("locationPh")}
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <button type="button" onClick={() => void geo()} className="grid size-10 place-items-center text-muted" aria-label={t("useLocation")}>
              <LocateFixed className="size-5" />
            </button>
            <Button type="submit" className="h-10 rounded-full px-5">
              {t("search")}
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-h-10 min-w-[13.5rem] flex-1 rounded-full bg-surface p-0.5 ring-1 ring-border sm:flex-none">
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
              "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold ring-1",
              filters || extraFilters ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            {t("filters")}
            {extraFilters ? (
              <span className="grid size-4 place-items-center rounded-full bg-bg text-[10px] text-fg">{extraFilters}</span>
            ) : null}
          </button>
          <div className="flex h-10 min-w-[10rem] flex-1 rounded-full bg-surface p-0.5 ring-1 ring-border sm:flex-none">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn("flex-1 rounded-full px-4 text-[13px] font-semibold", view === "list" ? "bg-fg text-bg" : "text-muted")}
            >
              {t("list")}
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

        {filters ? (
          <div className="mt-3 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
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
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>{t("radius")}</span>
                <span className="tabular-nums">
                  {radiusKm} {t("km")}
                </span>
              </div>
              <input type="range" min={1} max={100} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-primary" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRadiusKm(n)}
                    className={cn("rounded-full px-3 py-1 text-xs ring-1", radiusKm === n ? "bg-fg text-bg ring-fg" : "ring-border")}
                  >
                    {n} {t("km")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["any", "infant", "toddler", "preschool"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgeGroup(a === "any" ? "any" : (a as AgeGroup))}
                  className={cn("rounded-full px-3 py-1.5 text-sm ring-1", ageGroup === a ? "bg-fg text-bg ring-fg" : "ring-border")}
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
                  className={cn("rounded-full px-3 py-1.5 text-sm ring-1", sort === k ? "bg-fg text-bg ring-fg" : "ring-border")}
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
              <textarea value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("matchPh")} rows={2} className="mt-2 w-full rounded-md border border-border bg-bg p-3 text-sm" />
              <Button type="button" className="mt-3" disabled={matchBusy || !need.trim()} onClick={() => void runMatch()}>
                {t("matchGo")}
              </Button>
              {matchNote ? <p className="mt-3 text-sm text-muted">{matchNote}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={cn(view === "map" ? "hidden lg:block" : "block")}>
            {items === null ? (
              <div className="ke-listings-narrow">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-2" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="rounded-xl bg-surface p-8 text-center text-muted ring-1 ring-border">
                {liveOnly && (items?.length ?? 0) > 0 ? t("noLiveResults") : t("noResults")}
              </p>
            ) : (
              <div className={cn("ke-listings-narrow", refreshing && "opacity-70")}>
                {list.map((item) => (
                  <div key={item.id} onMouseEnter={() => setActive(item.slug)} className={cn(active === item.slug && "rounded-xl ring-2 ring-fg")}>
                    <DaycareCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div
            className={cn(
              "h-[45dvh] min-h-[16rem] overflow-hidden rounded-xl shadow-card ring-1 ring-border lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]",
              view === "list" ? "hidden lg:block" : "block",
            )}
          >
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
            />
          </div>
        </div>
      </div>
      <CompareBar />
    </Shell>
  );
}
