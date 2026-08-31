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

  const count = items?.length ?? 0;
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

  return (
    <Shell>
      <div className="ke-gutter mx-auto max-w-7xl py-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[clamp(1.75rem,5vw,1.875rem)]">
              {t("nearYou")} {origin.label.split(",")[0]}
            </h1>
            <p className="text-sm text-muted">
              {list.length} {list.length === 1 ? "centre" : "centres"}
              {liveOnly ? ` · ${t("liveOnly")}` : ` · ${liveCount} ${t("live")}`} · {radiusKm} {t("km")}
            </p>
            <p className="mt-1 text-xs text-subtle">{t("allCentresLicensed")} · {t("liveMeans")}</p>
          </div>
          <Link to="/" search={{ change: "1" }} className="inline-flex min-h-11 shrink-0 items-center text-sm text-primary underline-offset-4 hover:underline">
            {t("changeLocation")}
          </Link>
        </div>
        <form
          className="flex flex-col gap-2 lg:flex-row lg:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            applyQuery();
          }}
        >
          <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full bg-surface px-4 shadow-card ring-1 ring-border">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("locationPh")}
              className="h-11 flex-1 bg-transparent text-base outline-none"
            />
            <button type="button" onClick={geo} className="grid size-11 place-items-center text-muted hover:text-fg" aria-label={t("useLocation")}>
              <LocateFixed className="size-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="min-h-11 flex-1 lg:flex-none">{t("search")}</Button>
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => setFilters((v) => !v)}>
              <SlidersHorizontal className="size-4" />
              {radiusKm} {t("km")}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMatchOpen((v) => !v)}>
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">{t("match")}</span>
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLiveOnly(true)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium ring-1",
              liveOnly ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border",
            )}
          >
            {t("liveOnly")} · {liveCount}
          </button>
          <button
            type="button"
            onClick={() => setLiveOnly(false)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium ring-1",
              !liveOnly ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
            )}
          >
            {t("showAll")} · {count}
          </button>
          {(
            [
              ["open", t("filterOpen")],
              ["waitlist", t("filterWaitlist")],
              ["unknown", t("filterUnknown")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAvail((v) => (v === key ? "any" : key))}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium ring-1",
                avail === key ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border",
              )}
            >
              {label}
            </button>
          ))}
          {(
            [
              [ten, setTen, t("filterTen")],
              [meals, setMeals, t("filterMeals")],
              [outdoor, setOutdoor, t("filterOutdoor")],
              [inclusive, setInclusive, t("filterInclusive")],
              [extended, setExtended, t("filterExtended")],
              [infantOnly, setInfantOnly, t("filterInfant")],
            ] as const
          ).map(([on, set, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => set(!on)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium ring-1",
                on ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filters ? (
          <div className="mt-3 space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>{t("radius")}</span>
                <span className="tabular-nums">
                  {radiusKm} {t("km")}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRadiusKm(n)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs ring-1",
                      radiusKm === n ? "bg-primary text-primary-fg ring-primary" : "ring-border",
                    )}
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
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm ring-1",
                    ageGroup === a ? "bg-primary text-primary-fg ring-primary" : "ring-border",
                  )}
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
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm ring-1",
                    sort === k ? "bg-fg text-bg ring-fg" : "ring-border",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {matchOpen ? (
          <div className="mt-3 rounded-xl bg-surface p-4 ring-1 ring-border">
            <label className="text-sm font-medium">{t("matchNeed")}</label>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder={t("matchPh")}
              rows={3}
              className="mt-2 w-full rounded-md border border-border bg-bg p-3 text-sm"
            />
            <Button type="button" className="mt-3" disabled={matchBusy || !need.trim()} onClick={() => void runMatch()}>
              {t("matchGo")}
            </Button>
            {matchNote ? <p className="mt-3 text-sm text-muted">{matchNote}</p> : null}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2 lg:hidden">
          <Button variant={view === "list" ? "primary" : "secondary"} className="min-h-11 flex-1" onClick={() => setView("list")}>
            {t("list")}
          </Button>
          <Button variant={view === "map" ? "primary" : "secondary"} className="min-h-11 flex-1" onClick={() => setView("map")}>
            {t("map")}
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={cn(view === "map" ? "hidden lg:block" : "block")}>
            {items === null ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1 xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-2" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="rounded-xl bg-surface p-8 text-center text-muted ring-1 ring-border">
                {liveOnly && (items?.length ?? 0) > 0 ? t("noLiveResults") : t("noResults")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1 xl:grid-cols-2">
                {list.map((item) => (
                  <div
                    key={item.id}
                    onMouseEnter={() => setActive(item.slug)}
                    className={cn(active === item.slug && "rounded-xl ring-2 ring-fg")}
                  >
                    <DaycareCard item={item} compact />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={cn("h-[45dvh] min-h-[16rem] overflow-hidden rounded-xl shadow-card ring-1 ring-border lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]", view === "list" ? "hidden lg:block" : "block")}>
            <MapView
              items={list}
              origin={origin}
              radiusKm={radiusKm}
              activeSlug={active}
              onSelect={(slug) => setActive(slug)}
              onRelocate={(pos) => {
                setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) });
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
