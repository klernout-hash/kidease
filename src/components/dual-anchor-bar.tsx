import { useState } from "react";
import { PlaceSearch, resolveLocationQuery, type ResolvedPlace } from "@/components/place-search";
import type { AnchorMode } from "@/lib/dual-anchor";
import { cn } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";

export function DualAnchorBar({
  mode,
  onMode,
  home,
  work,
  workQuery,
  onWorkQuery,
  onWorkResolved,
  onClearWork,
}: {
  mode: AnchorMode;
  onMode: (mode: AnchorMode) => void;
  home: { lat: number; lng: number };
  work: ResolvedPlace | null;
  workQuery: string;
  onWorkQuery: (q: string) => void;
  onWorkResolved: (place: ResolvedPlace) => void;
  onClearWork: () => void;
}) {
  const { t } = useCopy();
  const [showWork, setShowWork] = useState(Boolean(work) || mode !== "home");
  const [miss, setMiss] = useState(false);

  function pick(next: AnchorMode) {
    onMode(next);
    if (next !== "home") setShowWork(true);
  }

  async function resolveWork(raw: string) {
    const hit = await resolveLocationQuery(raw);
    if (hit) {
      setMiss(false);
      onWorkResolved(hit);
      return;
    }
    setMiss(Boolean(raw.trim()));
  }

  return (
    <div className="mt-3 space-y-2" data-dual-anchor="">
      <div
        className="flex h-11 w-full min-w-0 rounded-full bg-surface p-0.5 ring-1 ring-border"
        role="tablist"
        aria-label={t("anchorBoth")}
      >
        {(
          [
            ["home", t("anchorHome")],
            ["work", t("anchorWork")],
            ["both", t("anchorBoth")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            data-anchor-mode={key}
            onClick={() => pick(key)}
            className={cn(
              "flex-1 rounded-full px-2 text-[13px] font-semibold sm:px-3",
              mode === key ? "bg-fg text-bg" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {showWork ? (
        <form
          className="relative z-40 flex min-h-12 min-w-0 items-center gap-1.5 overflow-visible rounded-full bg-surface pl-3 pr-1.5 shadow-card ring-1 ring-border"
          onSubmit={(e) => {
            e.preventDefault();
            void resolveWork(workQuery);
          }}
        >
          <PlaceSearch
            value={workQuery}
            onChange={(q) => {
              setMiss(false);
              onWorkQuery(q);
            }}
            onResolved={(place) => {
              setMiss(false);
              onWorkResolved(place);
            }}
            placeholder={t("anchorWorkPh")}
            origin={home}
            ariaLabel={t("anchorWorkLabel")}
            className="h-11 min-h-11 overflow-visible"
            inputClassName="h-11 min-w-0 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
          />
          {work ? (
            <button type="button" onClick={onClearWork} className="shrink-0 px-2 text-xs font-semibold text-muted">
              {t("anchorClearWork")}
            </button>
          ) : (
            <button type="submit" className="shrink-0 px-2 text-xs font-semibold text-primary">
              {t("search")}
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowWork(true);
            onMode("both");
          }}
          className="text-sm font-medium text-primary"
        >
          {t("anchorAddWork")}
        </button>
      )}
      {miss ? <p className="text-xs text-muted">{t("anchorWorkMiss")}</p> : null}
      {mode !== "home" && !work && !miss ? <p className="text-xs text-muted">{t("anchorNeedWork")}</p> : null}
    </div>
  );
}
