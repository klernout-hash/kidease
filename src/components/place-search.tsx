import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { geocode } from "@/lib/geo";
import {
  geocodePlace,
  resolvePlaceId,
  suggestPlaces,
  type PlaceSuggestion,
} from "@/lib/server/google-places";
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
  const session = useRef(newSession());
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuBox, setMenuBox] = useState<{ left: number; top: number; width: number } | null>(null);

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

  useLayoutEffect(() => {
    function measure() {
      const el = wrap.current;
      if (!el || !open) {
        setMenuBox(null);
        return;
      }
      const box = el.getBoundingClientRect();
      setMenuBox({ left: box.left, top: box.bottom + 6, width: Math.max(box.width, 220) });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, hits.length, value]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) {
        const menu = document.getElementById(listId);
        if (menu?.contains(event.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listId]);

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
          if (hits.length) setOpen(true);
        }}
        onKeyDown={(e) => {
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
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && hits.length > 0 && menuBox && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              data-place-suggestions=""
              className="fixed z-[80] max-h-64 overflow-auto rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
              style={{ left: menuBox.left, top: menuBox.top, width: menuBox.width }}
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
