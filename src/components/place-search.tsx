import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { geocode, postalSearchLabel } from "@/lib/geo";
import {
  geocodePlace,
  resolvePlaceId,
  suggestPlaces,
  type PlaceSuggestion,
} from "@/lib/server/google-places";
import { DISMISS_POPOVERS, placeHostVisible } from "@/lib/dismiss-popovers";
import { matchDaycareNames } from "@/lib/server/daycare-name-search";
import {
  centreSlugFromPlaceId,
  geocodeWithBrowser,
  isCentrePlaceId,
  placeMatchRank,
  rankPlaceSuggestions,
  resolveLocalPlace,
  resolvePlaceIdBrowser,
  suggestLocalPlaces,
  suggestPlacesBrowser,
} from "@/lib/place-suggest";
import { isGenericCareQuery } from "@/lib/generic-care-query";
import { cn } from "@/lib/utils";

export type ResolvedPlace = { lat: number; lng: number; label: string };

export type WhereDestination = { label: string; lat: number; lng: number };

export type WhereEmptyMenu = {
  title: string;
  nearby: string;
  nearbyHint: string;
  onNearby?: () => void;
  cities: WhereDestination[];
};

/**
 * Address lookups already made in this tab, keyed by the typed text and by the
 * label the lookup returned. The search page re-resolves the label it was sent
 * to ("200 Main Street, Winnipeg, Manitoba"); that hit no longer costs a second
 * round trip. Same-text lookups in flight share one request.
 */
const REMOTE_PLACE_MEMO = new Map<string, ResolvedPlace>();
const REMOTE_PLACE_INFLIGHT = new Map<string, Promise<ResolvedPlace | null>>();
const REMOTE_PLACE_MEMO_MAX = 50;

function placeMemoKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function rememberRemotePlace(q: string, place: ResolvedPlace) {
  if (REMOTE_PLACE_MEMO.size >= REMOTE_PLACE_MEMO_MAX) REMOTE_PLACE_MEMO.clear();
  REMOTE_PLACE_MEMO.set(placeMemoKey(q), place);
  if (place.label) REMOTE_PLACE_MEMO.set(placeMemoKey(place.label), place);
}

async function remotePlace(q: string): Promise<ResolvedPlace | null> {
  const key = placeMemoKey(q);
  const saved = REMOTE_PLACE_MEMO.get(key);
  if (saved) return saved;
  const pending = REMOTE_PLACE_INFLIGHT.get(key);
  if (pending) return pending;
  const run = geocodePlace({ data: q })
    .then((place) => {
      if (place) rememberRemotePlace(q, place);
      return place;
    })
    .finally(() => REMOTE_PLACE_INFLIGHT.delete(key));
  REMOTE_PLACE_INFLIGHT.set(key, run);
  return run;
}

export async function resolveLocationQuery(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  // Care words are keywords / categories, not places — never spend a Photon call.
  if (isGenericCareQuery(q)) return null;
  const local = geocode(q);
  if (local) return local;
  try {
    const remote = await remotePlace(q);
    if (remote) return remote;
  } catch {
    /* address lookup can be empty or denied */
  }
  return geocodeWithBrowser(q);
}

async function loadSuggestions(
  q: string,
  origin?: { lat: number; lng: number },
  session?: string,
  includeCentres = false,
): Promise<PlaceSuggestion[]> {
  let remote: PlaceSuggestion[] = [];
  try {
    remote = await suggestPlaces({
      data: { q, session, lat: origin?.lat, lng: origin?.lng },
    });
  } catch {
    remote = [];
  }
  if (!remote.length) remote = await suggestPlacesBrowser(q, origin);
  const local = suggestLocalPlaces(q, 12);
  let merged = rankPlaceSuggestions(q, [...local, ...remote], 6);
  const cityHit = merged.some((row) => placeMatchRank(q, row.label, row.secondary) <= 1);
  if (includeCentres && !cityHit) {
    try {
      const names = await matchDaycareNames({ data: q });
      const centres = names.slice(0, 4).map((hit) => ({
        placeId: `centre:${hit.slug}`,
        label: hit.name,
        secondary: [hit.city, hit.province].filter(Boolean).join(", "),
      }));
      merged = rankPlaceSuggestions(q, [...merged, ...centres], 6);
    } catch {
      /* name lookup can be empty without a database */
    }
  }
  return merged;
}

/**
 * Where suggestions for the Explore sheet. Same order as PlaceSearch: server Places
 * (Photon on the server, no browser key), then the browser fallback, merged with local cities.
 */
export function suggestWherePlaces(q: string, origin?: { lat: number; lng: number }): Promise<PlaceSuggestion[]> {
  return loadSuggestions(q, origin);
}

function newSession() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function menuContains(listId: string, node: Node | null) {
  if (!node) return false;
  const menu = document.getElementById(listId);
  return Boolean(menu?.contains(node));
}

export function PlaceSearch({
  value,
  onChange,
  onResolved,
  onEnterResolved,
  placeholder,
  className,
  inputClassName,
  origin,
  id,
  name,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  invalid,
  emptyMenu,
  onCentre,
}: {
  value: string;
  onChange: (q: string) => void;
  onResolved: (place: ResolvedPlace) => void;
  onEnterResolved?: (place: ResolvedPlace) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  origin?: { lat: number; lng: number };
  id?: string;
  /** Lets a search form submit the city even before JavaScript runs. */
  name?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
  /** Shown on focus before a city is typed. Nearby stays first. */
  emptyMenu?: WhereEmptyMenu;
  /** A daycare name in the Where box opens that listing. */
  onCentre?: (hit: { slug: string; label: string }) => void;
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const session = useRef(newSession());
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [destOpen, setDestOpen] = useState(false);
  const focusedValue = useRef(value);
  const holdDest = useRef(false);
  const onCentreRef = useRef(onCentre);
  onCentreRef.current = onCentre;
  const showDestinations = Boolean(emptyMenu) && destOpen && !open && (value.trim().length < 2 || value === focusedValue.current);

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    close();
  }, [pathname]);

  useEffect(() => {
    const q = value.trim();
    const untouched = q === focusedValue.current.trim();
    if (q.length < 2 || untouched) {
      setHits([]);
      setOpen(false);
      return;
    }
    let live = true;
    const tmr = window.setTimeout(() => {
      void loadSuggestions(q, origin, session.current, Boolean(onCentreRef.current)).then((rows) => {
        if (!live || holdDest.current) return;
        if (!placeHostVisible(wrap.current)) return;
        if (document.activeElement !== input.current) return;
        setHits(rows);
        setOpen(rows.length > 0);
        setActive(0);
      });
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(tmr);
    };
  }, [value, origin?.lat, origin?.lng]);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: Event) {
      const target = event.target as Node | null;
      if (wrap.current?.contains(target) || menuContains(listId, target)) return;
      close();
    }

    function onScroll(event: Event) {
      const target = event.target;
      if (target instanceof Node && menuContains(listId, target)) return;
      close();
    }

    function onDismiss() {
      close();
    }

    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener(DISMISS_POPOVERS, onDismiss);
    window.visualViewport?.addEventListener("resize", onDismiss);
    window.visualViewport?.addEventListener("scroll", onDismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener(DISMISS_POPOVERS, onDismiss);
      window.visualViewport?.removeEventListener("resize", onDismiss);
      window.visualViewport?.removeEventListener("scroll", onDismiss);
    };
  }, [open, listId]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio === 0)) close();
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  async function pick(hit: PlaceSuggestion, fromKeyboard = false) {
    const typed = input.current?.value;
    setOpen(false);
    if (isCentrePlaceId(hit.placeId)) {
      const slug = centreSlugFromPlaceId(hit.placeId);
      setHits([]);
      if (slug && onCentreRef.current) {
        onCentreRef.current({ slug, label: hit.label });
        return;
      }
    }
    const local = resolveLocalPlace(hit.placeId);
    const resolved =
      local ??
      (await resolvePlaceId({
        data: { placeId: hit.placeId, session: session.current },
      }).catch(() => null)) ??
      (await resolvePlaceIdBrowser(hit.placeId));
    if (input.current?.value !== typed) return;
    session.current = newSession();
    setHits([]);
    if (resolved) {
      // A typed postal code stays the label; the FSA's city would drop it.
      const postal = postalSearchLabel(value);
      const place = postal ? { ...resolved, label: postal } : resolved;
      onChange(place.label);
      if (fromKeyboard && onEnterResolved) onEnterResolved(place);
      else onResolved(place);
      return;
    }
    onChange(hit.label);
  }

  return (
    <div ref={wrap} className={cn("relative z-30 min-w-0 flex-1 overflow-visible", className)}>
      <input
        ref={input}
        id={id}
        name={name}
        value={value}
        onFocus={() => {
          if (!placeHostVisible(wrap.current)) return;
          focusedValue.current = value;
          if (emptyMenu) {
            holdDest.current = true;
            setActive(0);
            setDestOpen(true);
          }
        }}
        onClick={() => {
          if (!emptyMenu) return;
          focusedValue.current = value;
          holdDest.current = true;
          setHits([]);
          setOpen(false);
          setDestOpen(true);
        }}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setOpen(false);
          if (next.trim() === focusedValue.current.trim()) {
            holdDest.current = true;
            setDestOpen(Boolean(emptyMenu));
            return;
          }
          holdDest.current = false;
          setDestOpen(false);
        }}
        placeholder={placeholder}
        className={inputClassName}
        role="combobox"
        aria-expanded={open || showDestinations}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid}
        autoComplete="off"
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (wrap.current?.contains(next) || menuContains(listId, next)) return;
          window.setTimeout(() => {
            if (document.activeElement === input.current) return;
            if (menuContains(listId, document.activeElement)) return;
            close();
            holdDest.current = false;
            setDestOpen(false);
          }, 0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            close();
            holdDest.current = false;
            setDestOpen(false);
            return;
          }
          if (showDestinations && emptyMenu) {
            const count = 1 + emptyMenu.cities.length;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % count);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + count) % count);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (active <= 0) {
                setDestOpen(false);
                emptyMenu.onNearby?.();
                return;
              }
              const city = emptyMenu.cities[active - 1];
              if (!city) return;
              setDestOpen(false);
              onChange(city.label);
              onResolved(city);
              return;
            }
          }
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            void pick(hits[active]!, true);
          }
        }}
      />
      {showDestinations && emptyMenu ? (
        <div
          data-ke="where-destinations"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-surface py-3 shadow-lift ring-1 ring-border max-md:static max-md:inset-auto max-md:z-auto max-md:mt-2 max-md:w-full"
        >
          <p className="px-4 pb-1 pt-1 text-xs font-semibold text-muted">{emptyMenu.title}</p>
          <ul>
            <li>
              <button
                type="button"
                tabIndex={-1}
                data-ke="where-nearby"
                className={cn(
                  "mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                  active === 0 ? "bg-surface-2 ring-1 ring-border" : "bg-surface-2",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDestOpen(false);
                  emptyMenu.onNearby?.();
                }}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">
                  <LocateFixed className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-fg">{emptyMenu.nearby}</span>
                  <span className="block text-xs text-muted">{emptyMenu.nearbyHint}</span>
                </span>
              </button>
            </li>
            {emptyMenu.cities.map((city, i) => (
              <li key={city.label}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2",
                    active === i + 1 ? "bg-surface-2" : "",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDestOpen(false);
                    onChange(city.label);
                    onResolved(city);
                  }}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                    <MapPin className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-fg">{city.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          data-place-suggestions=""
          className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-30 max-h-64 overflow-auto rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border max-md:static max-md:inset-auto max-md:z-auto max-md:mt-2 max-md:w-full"
        >
          {hits.map((hit, i) => (
            <li key={hit.placeId} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-sm",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(hit)}
              >
                <span className="font-medium text-fg">{hit.label}</span>
                {hit.secondary ? <span className="text-xs text-muted">{hit.secondary}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
