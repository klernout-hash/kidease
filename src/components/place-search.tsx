import { useEffect, useId, useRef, useState } from "react";
import { geocode } from "@/lib/geo";
import { geocodePlace, resolvePlaceId, suggestPlaces, type PlaceSuggestion } from "@/lib/server/google-places";
import { cn } from "@/lib/utils";

export type ResolvedPlace = { lat: number; lng: number; label: string };

export async function resolveLocationQuery(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  const local = geocode(q);
  if (local) return local;
  return geocodePlace({ data: q });
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
}: {
  value: string;
  onChange: (q: string) => void;
  onResolved: (place: ResolvedPlace) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  origin?: { lat: number; lng: number };
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const session = useRef(newSession());
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    let live = true;
    const tmr = window.setTimeout(() => {
      void suggestPlaces({
        data: { q, session: session.current, lat: origin?.lat, lng: origin?.lng },
      })
        .then((rows) => {
          if (!live) return;
          setHits(rows);
          setOpen(rows.length > 0);
          setActive(0);
        })
        .catch(() => {
          if (live) {
            setHits([]);
            setOpen(false);
          }
        });
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(tmr);
    };
  }, [value, origin?.lat, origin?.lng]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(hit: PlaceSuggestion) {
    const resolved = await resolvePlaceId({ data: { placeId: hit.placeId, session: session.current } });
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
    <div ref={wrap} className={cn("relative min-w-0 flex-1", className)}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
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
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-[50] max-h-64 overflow-auto rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
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
