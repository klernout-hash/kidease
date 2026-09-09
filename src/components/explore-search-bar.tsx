import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, Search } from "lucide-react";
import { ChipButton } from "@/components/chip";
import { PlaceSearch, type ResolvedPlace } from "@/components/place-search";
import { formatExploreDateRange } from "@/lib/explore-search";
import { DISMISS_POPOVERS } from "@/lib/dismiss-popovers";
import type { CopyKey } from "@/lib/copy";
import { SEARCH_STARTS, type SearchStart } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const START_COPY: Record<SearchStart, CopyKey> = {
  now: "searchStartNow",
  "this-month": "searchStartThisMonth",
  "next-month": "searchStartNextMonth",
};

export type ExploreSearchBarValues = {
  where: string;
  name: string;
  from: string;
  to: string;
};

type Field = "where" | "when" | "name";

export function ExploreSearchBar({
  values,
  onWhereChange,
  onWhereResolved,
  onNameChange,
  onDatesChange,
  onStartChange,
  start,
  onSubmit,
  onLocate,
  origin,
  className,
}: {
  values: ExploreSearchBarValues;
  onWhereChange: (q: string) => void;
  onWhereResolved: (place: ResolvedPlace) => void;
  onNameChange: (name: string) => void;
  onDatesChange: (next: { from: string; to: string }) => void;
  start?: SearchStart | "";
  onStartChange?: (start: SearchStart | "") => void;
  onSubmit: () => void;
  onLocate?: () => void;
  origin?: { lat: number; lng: number };
  className?: string;
}) {
  const { t, locale } = useCopy();
  const whereId = useId();
  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const whereLabelId = useId();
  const whenLabelId = useId();
  const nameLabelId = useId();
  const whenPanelId = useId();
  const wrap = useRef<HTMLFormElement>(null);
  const [active, setActive] = useState<Field | null>(null);
  const dateLabel = formatExploreDateRange(values.from, values.to, locale);
  const startLabel = start ? t(START_COPY[start]) : "";
  const whenLabel = onStartChange ? startLabel || t("searchWhenHint") : dateLabel || t("searchWhenHint");
  const whenFilled = onStartChange ? Boolean(start) : Boolean(dateLabel);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setActive(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    function onDismiss() {
      setActive(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener(DISMISS_POPOVERS, onDismiss);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(DISMISS_POPOVERS, onDismiss);
    };
  }, []);

  function segmentClass(field: Field, index: number) {
    return cn(
      "relative flex min-h-[4.25rem] min-w-0 flex-1 flex-col justify-center overflow-visible px-5 py-3 text-left transition-colors",
      "lg:px-6",
      index === 0 && "rounded-t-[2rem] lg:rounded-none lg:rounded-l-full",
      index === 2 && "rounded-b-[2rem] lg:rounded-none lg:rounded-r-full",
      index > 0 &&
        "lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-8 lg:before:w-px lg:before:-translate-y-1/2 lg:before:bg-border",
      active === field ? "z-30 bg-surface-2" : "hover:bg-surface-2/90",
    );
  }

  return (
    <form
      ref={wrap}
      className={cn("w-full", className)}
      aria-label={t("searchBarAria")}
      data-search-row="where-when-name"
      onSubmit={(e) => {
        e.preventDefault();
        setActive(null);
        onSubmit();
      }}
    >
      <div className="relative z-20 flex flex-col min-h-[12.75rem] divide-y divide-border overflow-visible rounded-[2rem] bg-surface shadow-lift ring-1 ring-border/80 lg:min-h-[4.25rem] lg:flex-row lg:items-stretch lg:divide-y-0 lg:rounded-full">
        <div className={segmentClass("where", 0)} onClick={() => setActive("where")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <label
                id={whereLabelId}
                htmlFor={whereId}
                className="block text-[12px] font-semibold leading-4 text-fg"
              >
                {t("searchWhere")}
              </label>
              <PlaceSearch
                id={whereId}
                value={values.where}
                onChange={onWhereChange}
                onResolved={(place) => {
                  onWhereChange(place.label);
                  onWhereResolved(place);
                }}
                placeholder={t("searchWhereHint")}
                origin={origin}
                ariaLabelledBy={whereLabelId}
                className="min-h-6"
                inputClassName="mt-0.5 h-6 w-full bg-transparent text-base leading-6 text-fg outline-none placeholder:text-muted"
              />
            </div>
            {onLocate ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLocate();
                }}
                className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg hover:text-fg"
                aria-label={t("useLocation")}
              >
                <LocateFixed className="size-5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className={segmentClass("when", 1)}>
          <button
            type="button"
            className="w-full min-w-0 text-left"
            aria-expanded={active === "when"}
            aria-controls={whenPanelId}
            onClick={() => setActive((cur) => (cur === "when" ? null : "when"))}
          >
            <span id={whenLabelId} className="block text-[12px] font-semibold leading-4 text-fg">
              {t("searchWhen")}
            </span>
            <span
              className={cn(
                "mt-0.5 block h-6 truncate text-base leading-6",
                whenFilled ? "text-fg" : "text-muted",
              )}
            >
              {whenLabel}
            </span>
          </button>
          {active === "when" ? (
            <div
              id={whenPanelId}
              role="group"
              aria-labelledby={whenLabelId}
              className="absolute left-3 right-3 top-full z-[60] mt-2 rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-border lg:left-0 lg:right-auto lg:w-[22rem]"
            >
              {onStartChange ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {SEARCH_STARTS.map((window) => (
                      <ChipButton
                        key={window}
                        on={start === window}
                        aria-pressed={start === window}
                        onClick={() => {
                          onStartChange(start === window ? "" : window);
                          setActive(null);
                        }}
                      >
                        {t(START_COPY[window])}
                      </ChipButton>
                    ))}
                  </div>
                  {start ? (
                    <button
                      type="button"
                      className="mt-3 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        onStartChange("");
                        onDatesChange({ from: "", to: "" });
                        setActive(null);
                      }}
                    >
                      {t("searchClearDates")}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm" htmlFor={startId}>
                      <span className="font-semibold text-fg">{t("searchStartDate")}</span>
                      <input
                        id={startId}
                        type="date"
                        className="ke-input mt-1 w-full text-base"
                        value={values.from}
                        onChange={(e) => {
                          const from = e.target.value;
                          onDatesChange({
                            from,
                            to: values.to && from && values.to < from ? "" : values.to,
                          });
                        }}
                      />
                    </label>
                    <label className="block text-sm" htmlFor={endId}>
                      <span className="font-semibold text-fg">{t("searchEndDate")}</span>
                      <input
                        id={endId}
                        type="date"
                        className="ke-input mt-1 w-full text-base"
                        min={values.from || undefined}
                        value={values.to}
                        onChange={(e) => onDatesChange({ from: values.from, to: e.target.value })}
                      />
                    </label>
                  </div>
                  {values.from || values.to ? (
                    <button
                      type="button"
                      className="mt-3 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => onDatesChange({ from: "", to: "" })}
                    >
                      {t("searchClearDates")}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-muted">{t("needBy")}</p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className={cn(segmentClass("name", 2), "lg:pr-2")}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <label
                id={nameLabelId}
                htmlFor={nameId}
                className="block text-[12px] font-semibold leading-4 text-fg"
              >
                {t("searchDaycare")}
              </label>
              <input
                id={nameId}
                value={values.name}
                onChange={(e) => onNameChange(e.target.value)}
                onFocus={() => setActive("name")}
                placeholder={t("searchDaycareHint")}
                aria-labelledby={nameLabelId}
                autoComplete="off"
                className="mt-0.5 h-6 w-full bg-transparent text-base leading-6 text-fg outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="submit"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-fg shadow-card hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={t("search")}
            >
              <Search className="size-5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
