import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { matchDaycareNames, DAYCARE_NAME_MATCH_LIMIT, type DaycareNameHit } from "@/lib/server/daycare-name-search";
import { useCopy } from "@/lib/use-copy";

export function DaycareNameField({
  id,
  labelId,
  value,
  onChange,
  placeholder,
  inputClassName,
  onFocus,
}: {
  id: string;
  labelId: string;
  value: string;
  onChange: (name: string) => void;
  placeholder: string;
  inputClassName?: string;
  onFocus?: () => void;
}) {
  const { t } = useCopy();
  const listId = useId();
  const [hits, setHits] = useState<DaycareNameHit[]>([]);
  const [open, setOpen] = useState(false);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setCapped(false);
      setOpen(false);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void matchDaycareNames({ data: q })
        .then((rows) => {
          if (!live) return;
          setHits(rows);
          setCapped(rows.length >= DAYCARE_NAME_MATCH_LIMIT);
          setOpen(true);
        })
        .catch(() => {
          if (!live) return;
          setHits([]);
          setCapped(false);
          setOpen(true);
        });
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [value]);

  const show = open && value.trim().length >= 2;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          onFocus?.();
          if (value.trim().length >= 2) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        aria-labelledby={labelId}
        aria-expanded={show}
        aria-controls={listId}
        role="combobox"
        aria-autocomplete="list"
        autoComplete="off"
        className={inputClassName || "mt-0.5 h-5 w-full bg-transparent text-base leading-5 text-fg outline-none placeholder:text-muted"}
      />
      {show ? (
        <div
          id={listId}
          data-ke="daycare-name-hits"
          className="absolute left-0 top-[calc(100%+0.75rem)] z-[80] max-h-80 w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-2xl bg-surface py-2 shadow-lift ring-1 ring-border"
        >
          {hits.length ? (
            <ul>
              {hits.map((hit) => {
                const place = [hit.city, hit.province].filter(Boolean).join(", ");
                return (
                  <li key={hit.slug}>
                    <Link
                      to="/daycare/$slug"
                      params={{ slug: hit.slug }}
                      className="block px-3 py-2 hover:bg-surface-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(hit.name);
                        setOpen(false);
                      }}
                    >
                      <span className="block text-sm font-semibold text-fg">{hit.name}</span>
                      {place ? <span className="block text-xs text-muted">{place}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted">{t("searchNameEmpty")}</p>
          )}
          {capped ? <p className="px-3 pt-1 text-xs text-muted">{t("searchNameMore")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
