import { useEffect, useId, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { geocode } from "@/lib/geo";
import {
  geocodePlace,
  resolvePlaceId,
  suggestPlaces,
  type PlaceSuggestion,
} from "@/lib/server/google-places";
import { DISMISS_POPOVERS, placeHostVisible } from "@/lib/dismiss-popovers";
import {
  geocodeWithBrowser,
  resolveLocalPlace,
  resolvePlaceIdBrowser,
  suggestLocalPlaces,
  suggestPlacesBrowser,
} from "@/lib/place-suggest";
import { cn } from "@/lib/utils";

export type ResolvedPlace = { lat: number; lng: number; label: string };

export async function resolveLocationQuery(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  const local = geocode(q);
  if (local) return local;
  try {
    const remote = await geocodePlace({ data: q });
    if (remote) return remote;
  } catch {
    /* server Places / Geocode can be empty or denied */
  }
  return geocodeWithBrowser(q);
}

async function loadSuggestions(
  q: string,
  origin?: { lat: number; lng: number },
  session?: string,
): Promise<PlaceSuggestion[]> {
  try {
    const rows = await suggestPlaces({
      data: { q, session, lat: origin?.lat, lng: origin?.lng },
    });
    if (rows.length) return rows;
  } catch {
    /* fall through to browser / local */
  }
  const browser = await suggestPlacesBrowser(q, origin);
  if (browser.length) return browser;
  return suggestLocalPlaces(q);
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
  placeholder,
  className,
  inputClassName,
  origin,
  id,
  ariaLabel,
  ariaLabelledBy,
}: {
  value: string;
  onChange: (q: string) => void;
  onResolved: (place: ResolvedPlace) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  origin?: { lat: number; lng: number };
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const session = useRef(newSession());
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    close();
  }, [pathname]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    let live = true;
    const tmr = window.setTimeout(() => {
      void loadSuggestions(q, origin, session.current).then((rows) => {
        if (!live) return;
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

  async function pick(hit: PlaceSuggestion) {
    const local = resolveLocalPlace(hit.placeId);
    const resolved =
      local ??
      (await resolvePlaceId({
        data: { placeId: hit.placeId, session: session.current },
      }).catch(() => null)) ??
      (await resolvePlaceIdBrowser(hit.placeId));
    session.current = newSession();
    setOpen(false);
    setHits([]);
    if (resolved) {
      onChange(resolved.label);
      onResolved(resolved);
      return;
    }
    onChange(hit.label);
  }

  return (
    <div ref={wrap} className={cn("relative z-40 min-w-0 flex-1 overflow-visible", className)}>
      <input
        ref={input}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        autoComplete="off"
        onFocus={() => {
          if (!placeHostVisible(wrap.current)) return;
          if (hits.length) setOpen(true);
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (wrap.current?.contains(next) || menuContains(listId, next)) return;
          window.setTimeout(() => {
            if (document.activeElement === input.current) return;
            if (menuContains(listId, document.activeElement)) return;
            close();
          }, 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close();
            return;
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
            void pick(hits[active]!);
          }
        }}
      />
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          data-place-suggestions=""
          className="absolute left-0 right-0 top-full z-[80] mt-1.5 max-h-64 overflow-auto rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
        >
          {hits.map((hit, i) => (
            <li key={hit.placeId} role="option" aria-selected={i === active}>
              <button
                type="button"
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
