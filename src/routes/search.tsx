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
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useAppStore, type SortKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { cwelccKind, hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { CompareBar } from "@/components/compare-bar";
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
  const [items, setItems] = useState<Card[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
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

  useEffect(() => {
    if (incoming.q) {
      const hit = geocode(incoming.q);
      if (hit) setOrigin(hit);
      setQuery(incoming.q);
    }
  }, [incoming.q, setOrigin, setQuery]);

  useEffect(() => {
    let live = true;
    setItems(null);
    void searchDaycares({
      data: { lat: origin.lat, lng: origin.lng, radiusKm, sort, ageGroup },
    })
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [origin.lat, origin.lng, radiusKm, sort, ageGroup]);

  function applyQuery() {
    const hit = geocode(query);
    if (hit) setOrigin(hit);
  }

  async function geo() {
    const pos = await getDeviceLocation();
    if (pos) {
      setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) });
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
    return rows;
  }, [items, liveOnly, avail, ten, meals, outdoor, inclusive, extended, infantOnly]);
  const liveCount = useMemo(() => (items ?? []).filter((r) => r.live).length, [items]);
  const extraFilters =
    (avail !== "any" ? 1 : 0) +
    (ten ? 1 : 0) +
    (meals ? 1 : 0) +
    (outdoor ? 1 : 0) +
    (inclusive ? 1 : 0) +
    (extended ? 1 : 0) +
    (infantOnly ? 1 : 0) +
    (ageGroup !== "any" ? 1 : 0);
  const city = origin.label.split(",")[0];

  function chip(on: boolean, label: string, action: () => void) {
    return (
      <button type="button" onClick={action} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1", on ? "bg-primary text-primary-fg ring-primary" : "bg-bg text-fg ring-border")}>
        {label}
      </button>
    );
  }

  return (
    <Shell>
      <div className="ke-gutter mx-auto max-w-7xl pb-4 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.65rem] leading-tight tracking-[-0.03em]">{city}</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {list.length} {list.length === 1 ? "centre" : "centres"}
              {DOT}
              {radiusKm} {t("km")}
            </p>
          </div>
          <Link to="/" search={{ change: "1" }} className="shrink-0 pb-0.5 text-[13px] font-medium text-primary">
            {t("changeLocation")}
          </Link>
        </div>

        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); applyQuery(); }}>
          <div className="flex min-h-12 items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 shadow-card ring-1 ring-border">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("locationPh")} className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
            <button type="button" onClick={() => void geo()} className="grid size-10 place-items-center text-muted" aria-label={t("useLocation")}>
              <LocateFixed className="size-5" />
            </button>
            <Button type="submit" className="h-10 rounded-full px-5">{t("search")}</Button>
          </div>
        </form>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-h-10 flex-1 rounded-full bg-surface p-0.5 ring-1 ring-border">
            <button type="button" onClick={() => setLiveOnly(true)} className={cn("flex-1 rounded-full px-3 text-[13px] font-semibold", liveOnly ? "bg-primary text-primary-fg" : "text-muted")}>
              {t("live")}{DOT}{liveCount}
            </button>
            <button type="button" onClick={() => setLiveOnly(false)} className={cn("flex-1 rounded-full px-3 text-[13px] font-semibold", !liveOnly ? "bg-fg text-bg" : "text-muted")}>
              {t("showAll")}
            </button>
          </div>
          <button type="button" onClick={() => setFilters((v) => !v)} className={cn("relative inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1", filters || extraFilters ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border")}>
            <SlidersHorizontal className="size-3.5" />
            {t("sort") === "Trier" ? "Filtres" : "Filters"}
            {extraFilters ? <span className="grid size-4 place-items-center rounded-full bg-bg text-[10px] text-fg">{extraFilters}</span> : null}
          </button>
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
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>{t("radius")}</span>
                <span className="tabular-nums">{radiusKm} {t("km")}</span>
              </div>
              <input type="range" min={1} max={100} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-primary" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((n) => (
                  <button key={n} type="button" onClick={() => setRadiusKm(n)} className={cn("rounded-full px-3 py-1 text-xs ring-1", radiusKm === n ? "bg-primary text-primary-fg ring-primary" : "ring-border")}>
                    {n} {t("km")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex gap-1 rounded-full bg-surface p-0.5 ring-1 ring-border">
          <button type="button" onClick={() => setView("list")} className={cn("min-h-9 flex-1 rounded-full text-[13px] font-semibold", view === "list" ? "bg-fg text-bg" : "text-muted")}>
            {t("list")}
          </button>
          <button type="button" onClick={() => setView("map")} className={cn("min-h-9 flex-1 rounded-full text-[13px] font-semibold", view === "map" ? "bg-fg text-bg" : "text-muted")}>
            {t("map")}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
              <div className="ke-listings-narrow">
                {list.map((item) => (
                  <div key={item.id} onMouseEnter={() => setActive(item.slug)} className={cn(active === item.slug && "rounded-xl ring-2 ring-fg")}>
                    <DaycareCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={cn("h-[45dvh] min-h-[16rem] overflow-hidden rounded-xl shadow-card ring-1 ring-border lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]", view === "list" ? "hidden lg:block" : "block")}>
            <MapView items={list} origin={origin} radiusKm={radiusKm} activeSlug={active} onSelect={(slug) => setActive(slug)} onRelocate={(pos) => { setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) }); void hapticLight(); }} />
          </div>
        </div>
      </div>
      <CompareBar />
    </Shell>
  );
}
