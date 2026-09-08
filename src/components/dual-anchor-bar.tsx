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

  function pick(next: AnchorMode) {
    onMode(next);
    if (next !== "home") setShowWork(true);
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
          className="flex min-h-12 min-w-0 items-center gap-1.5 rounded-full bg-surface pl-3 pr-1.5 shadow-card ring-1 ring-border"
          onSubmit={(e) => {
            e.preventDefault();
            void resolveLocationQuery(workQuery).then((hit) => {
              if (hit) onWorkResolved(hit);
            });
          }}
        >
          <PlaceSearch
            value={workQuery}
            onChange={onWorkQuery}
            onResolved={onWorkResolved}
            placeholder={t("anchorWorkPh")}
            origin={home}
            className="h-11 min-h-11"
            inputClassName="h-11 min-w-0 w-full bg-transparent text-[15px] outline-none"
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
      {mode !== "home" && !work ? <p className="text-xs text-muted">{t("anchorNeedWork")}</p> : null}
    </div>
  );
}
