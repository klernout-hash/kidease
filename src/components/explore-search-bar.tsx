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

const RADIUS_KM_OPTIONS = [5, 10, 25, 50] as const;

function SearchRadiusSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (km: number) => void;
}) {
  const { t } = useCopy();
  return (
    <select
      data-ke="search-radius"
      aria-label={t("searchRadius")}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className="h-11 max-w-[5.75rem] shrink-0 rounded-full bg-bg px-2 text-sm font-medium text-fg ring-1 ring-border"
    >
      {(RADIUS_KM_OPTIONS.includes(value as (typeof RADIUS_KM_OPTIONS)[number])
        ? RADIUS_KM_OPTIONS
        : [...RADIUS_KM_OPTIONS, value].sort((a, b) => a - b)
      ).map((km) => (
        <option key={km} value={km}>
          {km} km
        </option>
      ))}
    </select>
  );
}

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
  startCollapsed = false,
  childSummary,
  childAges,
  onChildAge,
  radiusKm,
  onRadiusChange,
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
  /** Results and home open as one pill; tap expands where → schedule → child. */
  startCollapsed?: boolean;
  childSummary?: string;
  childAges?: { id: string; label: string; on: boolean }[];
  onChildAge?: (id: string) => void;
  /** Kilometres around the city already shown in the where field. */
  radiusKm?: number;
  onRadiusChange?: (km: number) => void;
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
  const [expanded, setExpanded] = useState(!startCollapsed);
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
      "relative flex min-h-[2.75rem] min-w-0 flex-1 flex-col justify-center overflow-visible px-3 py-1 text-left transition-colors",
      "lg:px-4",
      index === 0 && "rounded-t-[2rem] lg:rounded-none lg:rounded-l-full",
      index === 2 && "rounded-b-[2rem] lg:rounded-none lg:rounded-r-full",
      index > 0 &&
        "lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-6 lg:before:w-px lg:before:-translate-y-1/2 lg:before:bg-border",
      active === field ? "z-30 bg-surface-2" : "hover:bg-surface-2/90",
    );
  }

  if (!expanded) {
    const whereLine = values.where.trim() || t("findChildcare");
    const meta = [whenFilled ? whenLabel : "", childSummary].filter(Boolean).join(" · ");
    return (
      <form
        className={cn("w-full", className)}
        aria-label={t("searchBarAria")}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex min-h-14 w-full items-center gap-2 rounded-full bg-surface py-1 pl-4 pr-1.5 shadow-card ring-1 ring-border">
          <button
            type="button"
            data-ke="search-pill"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={false}
            aria-label={t("searchBarAria")}
            onClick={() => setExpanded(true)}
          >
            <Search className="size-5 shrink-0 text-fg" strokeWidth={2.25} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{whereLine}</span>
              {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
            </span>
          </button>
          {onRadiusChange && radiusKm != null ? (
            <SearchRadiusSelect value={radiusKm} onChange={onRadiusChange} />
          ) : null}
          <button
            type="submit"
            data-ke="search-submit"
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg shadow-card hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {t("searchSubmit")}
          </button>
        </div>
      </form>
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
        if (startCollapsed) setExpanded(false);
      }}
    >
      {startCollapsed ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="min-h-11 px-2 text-sm font-medium text-muted"
            onClick={() => {
              setActive(null);
              setExpanded(false);
            }}
          >
            {t("close")}
          </button>
        </div>
      ) : null}
      <div className="relative z-20 flex min-h-[8.4rem] flex-col divide-y divide-border overflow-visible rounded-[1.5rem] bg-surface shadow-card ring-1 ring-border/80 lg:min-h-[2.75rem] lg:flex-row lg:flex-wrap lg:items-stretch lg:divide-y-0 lg:rounded-full">
        <div className={cn(segmentClass("where", 0), "lg:min-w-[12rem] lg:flex-[1.2]")} onClick={() => setActive("where")}>
          <div data-ke="where-field" className="min-w-0">
            <label
              id={whereLabelId}
              htmlFor={whereId}
              className="block truncate text-[12px] font-semibold leading-4 text-fg"
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
              inputClassName="mt-0.5 h-6 w-full min-w-0 bg-transparent text-base leading-5 text-fg outline-none placeholder:text-muted"
            />
          </div>
        </div>
        {(onRadiusChange && radiusKm != null) || onLocate ? (
          <div data-ke="where-controls" className="flex shrink-0 items-center gap-1 px-2 py-1">
            {onRadiusChange && radiusKm != null ? (
              <SearchRadiusSelect value={radiusKm} onChange={onRadiusChange} />
            ) : null}
            {onLocate ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLocate();
                }}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg hover:text-fg"
                aria-label={t("useLocation")}
              >
                <LocateFixed className="size-5" />
              </button>
            ) : null}
          </div>
        ) : null}

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
                "mt-0.5 block h-5 truncate text-base leading-5",
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
              className="absolute left-2 right-2 top-full z-[60] mt-1.5 rounded-xl bg-surface p-3 shadow-card ring-1 ring-border lg:left-0 lg:right-auto lg:w-[20rem]"
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

        <div className={cn(segmentClass("name", 2), "lg:min-w-[14rem] lg:pr-1.5")}>
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
                className="mt-0.5 h-5 w-full bg-transparent text-base leading-5 text-fg outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="submit"
              data-ke="search-submit"
              className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg shadow-card hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={t("findChildcare")}
            >
              {t("searchSubmit")}
            </button>
          </div>
          {childAges?.length && active === "name" && onChildAge ? (
            <div className="absolute left-2 right-2 top-full z-[60] mt-1.5 rounded-xl bg-surface p-3 shadow-card ring-1 ring-border lg:left-auto lg:right-0 lg:w-[22rem]">
              <p className="text-sm font-semibold text-fg">{t("searchChildAge")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {childAges.map((age) => (
                  <ChipButton
                    key={age.id}
                    on={age.on}
                    aria-pressed={age.on}
                    onClick={() => onChildAge(age.id)}
                  >
                    {age.label}
                  </ChipButton>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
