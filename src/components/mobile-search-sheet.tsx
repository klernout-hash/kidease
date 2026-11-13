import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { List, Map, Search, SlidersHorizontal, X } from "lucide-react";
import { popularHomeCities } from "@/lib/home-popular-cities";
import { reverseGeocode } from "@/lib/geo";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import {
  applyDateFlex,
  changeCount,
  CHILD_BANDS,
  childTotal,
  DATE_FLEX,
  emptyMobileSearch,
  localWhereSuggestions,
  MOBILE_CATEGORIES,
  nextStep,
  pickStartDate,
  readMobileSearches,
  rememberMobileSearch,
  resultsHeadline,
  resultsSubline,
  savedToDraft,
  SCHEDULES,
  setStep,
  mobileSearchParams,
  whereAnswer,
  whenAnswer,
  whoAnswer,
  writeMobileSearches,
  type ChildBand,
  type DateFlex,
  type MobileCategory,
  type MobileSearchDraft,
  type MobileSearchParams,
  type ScheduleChoice,
} from "@/lib/mobile-search-v2";
import { localIsoDate as isoDay } from "@/lib/explore-search";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";

const CATEGORY_KEY: Record<MobileCategory, CopyKey> = {
  all: "msv2All",
  centre: "msv2Centres",
  home: "msv2Homes",
  open: "msv2OpenNow",
  "before-after": "msv2BeforeAfter",
  french: "msv2French",
};

const BAND_KEY: Record<ChildBand, CopyKey> = {
  infant: "msv2Infant",
  toddler: "msv2Toddler",
  preschool: "msv2Preschool",
  "school-age": "msv2SchoolAge",
};

const FLEX_KEY: Record<DateFlex, CopyKey> = {
  exact: "msv2Exact",
  "two-weeks": "msv2TwoWeeks",
  month: "msv2WithinMonth",
  "school-year": "msv2SchoolYear",
};

const SCHEDULE_KEY: Record<ScheduleChoice, CopyKey> = {
  "full-time": "msv2FullTime",
  "part-time": "msv2PartTime",
  "before-after": "msv2SchedSchool",
  "drop-in": "msv2DropIn",
};

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduce;
}

function MonthCalendar({
  selected,
  locale,
  onPick,
}: {
  selected: string;
  locale: string;
  onPick: (iso: string) => void;
}) {
  const today = new Date();
  const todayIso = isoDay(today);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(selected) ? new Date(`${selected}T12:00:00`) : today;
  const [cursor, setCursor] = useState(() => new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  const monthLabel = cursor.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const canPrev = cursor.getTime() > monthStart.getTime();
  const lead = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(tag, { weekday: "narrow" }),
  );
  return (
    <div data-ke="msv2-calendar">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="grid size-12 place-items-center rounded-full text-fg disabled:opacity-30"
          aria-label={locale === "fr" ? "Mois précédent" : "Previous month"}
          disabled={!canPrev}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <p className="text-base font-semibold text-fg">{monthLabel}</p>
        <button
          type="button"
          className="grid size-12 place-items-center rounded-full text-fg"
          aria-label={locale === "fr" ? "Mois suivant" : "Next month"}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-base font-semibold text-muted">
        {weekdays.map((day, i) => (
          <span key={`${day}-${i}`} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = new Date(cursor.getFullYear(), cursor.getMonth(), i + 1);
          const iso = isoDay(date);
          const past = iso < todayIso;
          const on = iso === selected;
          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              aria-pressed={on}
              className={cn(
                "mx-auto grid size-11 place-items-center rounded-full text-base",
                on ? "bg-primary font-semibold text-primary-fg" : past ? "text-muted/40" : "text-fg",
              )}
              onClick={() => onPick(iso)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileSearchHome({
  origin,
  onCommit,
}: {
  origin?: { lat: number; lng: number; label?: string | null };
  onCommit: (params: MobileSearchParams, draft: MobileSearchDraft) => void;
}) {
  const { t, locale } = useCopy();
  const [draft, setDraft] = useState<MobileSearchDraft>(emptyMobileSearch);
  const [open, setOpen] = useState(false);
  return (
    <div data-ke="msv2-home">
      <div className="sticky top-[var(--ke-header-h,3.5rem)] z-30 -mx-1 bg-bg/95 px-1 pb-2 pt-1 backdrop-blur-md">
        <button
          type="button"
          data-ke="msv2-pill"
          className="flex h-14 w-full items-center gap-3 rounded-full bg-bg px-4 text-left shadow-card ring-1 ring-border"
          onClick={() => setOpen(true)}
        >
          <Search className="size-5 shrink-0 text-fg" strokeWidth={2.4} aria-hidden="true" />
          <span className="min-w-0 flex-1 text-center text-base font-semibold text-fg">{t("msv2FindNear")}</span>
        </button>
        <div
          data-ke="msv2-categories"
          className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MOBILE_CATEGORIES.map((id) => {
            const on = draft.category === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                data-ke={`msv2-cat-${id}`}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center rounded-full px-3 text-base font-semibold",
                  on ? "bg-primary text-primary-fg" : "bg-surface text-fg ring-1 ring-border",
                )}
                onClick={() => setDraft((cur) => ({ ...cur, category: id }))}
              >
                {t(CATEGORY_KEY[id])}
              </button>
            );
          })}
        </div>
      </div>
      {open ? (
        <SearchSheet
          draft={draft}
          origin={origin}
          onChange={setDraft}
          onClose={() => setOpen(false)}
          onCommit={(params, next) => {
            setDraft(next);
            setOpen(false);
            onCommit(params, next);
          }}
        />
      ) : null}
      <p className="sr-only">{locale === "fr" ? "Recherche mobile" : "Mobile search"}</p>
    </div>
  );
}

export function MobileSearchResults({
  draft,
  countLabel,
  onCommit,
  onFilters,
  filtersOpen = false,
  filterCount = 0,
  mapOn = false,
  onMap,
  chips,
}: {
  draft: MobileSearchDraft;
  countLabel: string;
  onCommit: (params: MobileSearchParams, draft: MobileSearchDraft) => void;
  onFilters: () => void;
  filtersOpen?: boolean;
  filterCount?: number;
  mapOn?: boolean;
  onMap?: () => void;
  chips: { id: string; label: string; on: boolean; onToggle: () => void }[];
}) {
  const { t, locale } = useCopy();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(draft);
  useEffect(() => setCurrent(draft), [draft]);
  const headline = resultsHeadline(whereAnswer(draft), locale);
  const sub = resultsSubline(draft, locale);
  return (
    <div data-ke="msv2-results" className="sticky top-[var(--ke-header-h,3.5rem)] z-30 bg-bg/95 pb-2 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-ke="msv2-back"
          className="grid size-12 shrink-0 place-items-center rounded-full text-fg"
          aria-label={t("back")}
          onClick={() => {
            if (window.history.length > 1) window.history.back();
          }}
        >
          ‹
        </button>
        <button
          type="button"
          data-ke="msv2-summary"
          className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2 text-left ring-1 ring-border"
          onClick={() => setOpen(true)}
        >
          <span className="block truncate text-base font-semibold text-fg">{headline}</span>
          {sub ? <span className="block truncate text-base text-muted">{sub}</span> : null}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2" data-ke="msv2-view-controls">
        <div data-ke="msv2-result-chips" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label={t("searchRowFilters")}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.on}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full px-3 text-base font-semibold",
                chip.on ? "bg-primary text-primary-fg" : "bg-surface text-fg ring-1 ring-border",
              )}
              onClick={chip.onToggle}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-ke="msv2-filters"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-fg ring-1 ring-border"
          aria-expanded={filtersOpen}
          aria-controls="search-filters"
          onClick={onFilters}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {t("filters")}{filterCount ? ` · ${filterCount}` : ""}
        </button>
        {onMap ? (
          <button
            type="button"
            data-ke="msv2-map-toggle"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-fg ring-1 ring-border"
            aria-pressed={mapOn}
            onClick={onMap}
          >
            {mapOn ? <List className="size-4" aria-hidden /> : <Map className="size-4" aria-hidden />}
            {mapOn ? t("list") : t("map")}
          </button>
        ) : null}
      </div>
      {countLabel ? (
        <p className="px-1 pt-1 text-base text-muted" data-ke="msv2-count">
          {countLabel}
        </p>
      ) : null}
      {open ? (
        <SearchSheet
          draft={current}
          onChange={setCurrent}
          onClose={() => {
            setCurrent(draft);
            setOpen(false);
          }}
          onCommit={(params, next) => {
            setCurrent(next);
            setOpen(false);
            onCommit(params, next);
          }}
        />
      ) : null}
    </div>
  );
}

function SearchSheet({
  draft,
  origin,
  onChange,
  onClose,
  onCommit,
}: {
  draft: MobileSearchDraft;
  origin?: { lat: number; lng: number; label?: string | null };
  onChange: (next: MobileSearchDraft) => void;
  onClose: () => void;
  onCommit: (params: MobileSearchParams, draft: MobileSearchDraft) => void;
}) {
  const { t, locale } = useCopy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  const [whereFocus, setWhereFocus] = useState(false);
  const [typed, setTyped] = useState(draft.where);
  const [recent, setRecent] = useState(() => readMobileSearches());
  const pushed = useRef(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (!node.open) node.showModal();
    history.pushState({ msv2: 1 }, "");
    pushed.current = true;
    function onPop() {
      pushed.current = false;
      closeRef.current();
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (node.open) node.close();
    };
  }, []);

  function close() {
    if (pushed.current) {
      pushed.current = false;
      history.back();
      return;
    }
    onClose();
  }

  const suggestions = localWhereSuggestions(typed);
  const cities = popularHomeCities(
    origin ? { lat: origin.lat, lng: origin.lng, label: origin.label || undefined } : undefined,
    locale === "fr" ? "fr" : "en",
  );
  const whereFilled = whereAnswer(draft);
  const whenFilled = whenAnswer(draft, locale);
  const whoFilled = whoAnswer(draft, locale);

  function chooseWhere(label: string, nearMe = false) {
    onChange({ ...draft, where: label, nearMe, step: "where" });
    setTyped(label);
    setWhereFocus(false);
  }

  async function chooseNearMe() {
    const pos = await getDeviceLocation({ precise: true });
    if (!pos) return;
    const label = reverseGeocode(pos.lat, pos.lng) || t("nearMe");
    chooseWhere(label, true);
  }

  function goNext() {
    const next = nextStep(draft.step);
    if (next === "search") {
      void submit();
      return;
    }
    onChange(setStep(draft, next));
  }

  async function submit() {
    let next = draft;
    let nearLabel = "";
    if (draft.nearMe && !draft.where.trim()) {
      const pos = await getDeviceLocation({ precise: true });
      if (!pos) return;
      nearLabel = reverseGeocode(pos.lat, pos.lng) || origin?.label || t("nearMe");
      next = { ...draft, where: nearLabel };
    } else if (draft.nearMe) {
      nearLabel = draft.where.trim();
    }
    const saved = rememberMobileSearch(recent, next);
    writeMobileSearches(saved);
    setRecent(saved);
    void hapticLight();
    onCommit(mobileSearchParams(next, nearLabel), next);
  }

  const last = draft.step === "who";

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      data-ke="msv2-sheet"
      data-step={draft.step}
      className={cn(
        "msv2-dialog fixed inset-x-0 bottom-0 z-50 m-0 mt-10 h-[calc(100dvh-2.5rem)] w-full max-w-none rounded-t-3xl border-0 bg-[#f3f1ec] p-0 text-fg shadow-card",
        reduce ? "motion-reduce:transition-opacity" : "transition-transform duration-300",
      )}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex justify-end px-4 pt-4">
          <button
            type="button"
            data-ke="msv2-close"
            className="grid size-12 place-items-center rounded-full bg-bg shadow-card"
            aria-label={t("msv2Close")}
            onClick={close}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-28">
          <StepCard
            open={draft.step === "where"}
            title={t("msv2Where")}
            titleId={draft.step === "where" ? titleId : undefined}
            answer={whereFilled}
            placeholder={t("msv2AddLocation")}
            onOpen={() => onChange(setStep(draft, "where"))}
          >
            {whereFocus ? null : <p className="sr-only">{t("msv2Where")}</p>}
            <label className="block">
              {whereFocus ? null : (
                <span className="mb-2 block text-2xl font-semibold" id={draft.step === "where" ? undefined : titleId}>
                  {t("msv2Where")}
                </span>
              )}
              <input
                data-ke="msv2-where-input"
                value={typed}
                placeholder={t("msv2WherePh")}
                autoComplete="off"
                className="h-14 w-full rounded-2xl bg-bg px-4 text-base outline-none ring-1 ring-border"
                onFocus={() => setWhereFocus(true)}
                onChange={(event) => {
                  setTyped(event.target.value);
                  onChange({ ...draft, where: event.target.value, nearMe: false });
                }}
              />
            </label>
            <div className="mt-3 space-y-1" data-ke="msv2-where-list">
              {typed.trim().length < 2 ? (
                <>
                  <ListButton label={t("nearMe")} hint={t("whereNearbyHint")} onClick={() => void chooseNearMe()} />
                  {recent.length ? <p className="px-1 pt-3 text-base font-semibold text-muted">{t("recentSearches")}</p> : null}
                  {recent.map((item) => (
                    <ListButton
                      key={`${item.where}-${item.at}`}
                      label={item.where}
                      hint={[item.from, whoAnswer(savedToDraft(item), locale)].filter(Boolean).join(" · ")}
                      onClick={() => {
                        onChange({ ...savedToDraft(item), category: draft.category });
                        setTyped(item.where);
                        setWhereFocus(false);
                      }}
                    />
                  ))}
                  <p className="px-1 pt-3 text-base font-semibold text-muted">{t("whereSuggested")}</p>
                  {cities.map((city) => (
                    <ListButton key={city.slug} label={city.label} onClick={() => chooseWhere(city.q || city.label)} />
                  ))}
                </>
              ) : (
                suggestions.map((row) => (
                  <ListButton
                    key={row.label}
                    label={row.label}
                    hint={row.secondary}
                    onClick={() => chooseWhere(row.label)}
                  />
                ))
              )}
            </div>
          </StepCard>

          <StepCard
            open={draft.step === "when"}
            title={t("msv2When")}
            titleId={draft.step === "when" ? titleId : undefined}
            answer={whenFilled}
            placeholder={t("msv2AddDate")}
            onOpen={() => onChange(setStep(draft, "when"))}
          >
            <div className="mb-3 flex gap-2" role="tablist" aria-label={t("msv2When")}>
              <Tab
                on={draft.dateFlex === "" || draft.dateFlex === "exact"}
                label={t("msv2StartTab")}
                onClick={() => onChange({ ...draft, dateFlex: "exact" })}
              />
              <Tab
                on={draft.dateFlex === "two-weeks" || draft.dateFlex === "month" || draft.dateFlex === "school-year"}
                label={t("msv2Flexible")}
                onClick={() => onChange(applyDateFlex(draft, "two-weeks"))}
              />
            </div>
            <MonthCalendar
              selected={draft.from}
              locale={locale}
              onPick={(iso) => onChange(pickStartDate(draft, iso))}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {DATE_FLEX.map((id) => (
                <Chip
                  key={id}
                  on={draft.dateFlex === id}
                  label={t(FLEX_KEY[id])}
                  onClick={() => onChange(applyDateFlex({ ...draft, from: draft.from || isoDay(new Date()) }, id))}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SCHEDULES.map((id) => (
                <Chip
                  key={id}
                  on={draft.schedule === id}
                  label={t(SCHEDULE_KEY[id])}
                  onClick={() => onChange({ ...draft, schedule: draft.schedule === id ? "" : id })}
                />
              ))}
            </div>
          </StepCard>

          <StepCard
            open={draft.step === "who"}
            title={t("msv2Who")}
            titleId={draft.step === "who" ? titleId : undefined}
            answer={whoFilled}
            placeholder={t("msv2AddChild")}
            onOpen={() => onChange(setStep(draft, "who"))}
          >
            <div className="space-y-3">
              {CHILD_BANDS.map((band) => {
                const count = draft.counts[band];
                return (
                  <div key={band} className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-fg">{t(BAND_KEY[band])}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="grid size-12 place-items-center rounded-full ring-1 ring-border disabled:text-muted"
                        aria-label={t("msv2Fewer")}
                        disabled={count <= 0}
                        onClick={() => onChange(changeCount(draft, band, -1))}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-base font-semibold" data-ke={`msv2-count-${band}`}>
                        {count}
                      </span>
                      <button
                        type="button"
                        className="grid size-12 place-items-center rounded-full ring-1 ring-border"
                        aria-label={t("msv2More")}
                        onClick={() => onChange(changeCount(draft, band, 1))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-3 text-base font-semibold text-primary underline"
              onClick={() => onChange(changeCount(draft, "preschool", 1))}
            >
              {t("msv2AddAnother")}
            </button>
            <div className="mt-4 space-y-2">
              <Toggle
                on={draft.subsidy}
                label={t("msv2Subsidy")}
                onClick={() => onChange({ ...draft, subsidy: !draft.subsidy })}
              />
              <Toggle
                on={draft.accessibility}
                label={t("msv2Access")}
                onClick={() => onChange({ ...draft, accessibility: !draft.accessibility })}
              />
              <Toggle
                on={draft.french}
                label={t("msv2FrenchProgram")}
                onClick={() => onChange({ ...draft, french: !draft.french })}
              />
            </div>
            <p className="sr-only">{childTotal(draft.counts)}</p>
          </StepCard>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border bg-[#f3f1ec] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="min-h-12 px-2 text-base font-semibold underline"
            onClick={() => {
              if (last) {
                const cleared = { ...emptyMobileSearch(), category: draft.category };
                onChange(cleared);
                setTyped("");
              } else if (draft.step === "when") {
                onChange({ ...draft, from: "", to: "", dateFlex: "", schedule: "" });
              } else {
                onChange({ ...draft, where: "", nearMe: false });
                setTyped("");
              }
            }}
          >
            {last ? t("msv2Clear") : t("msv2Reset")}
          </button>
          {last ? (
            <button
              type="button"
              data-ke="msv2-search"
              className="inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-primary-fg"
              onClick={() => void submit()}
            >
              <Search className="size-4" aria-hidden="true" />
              {t("searchSubmit")}
            </button>
          ) : (
            <button
              type="button"
              data-ke="msv2-next"
              className="inline-flex h-12 min-w-28 items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-primary-fg"
              onClick={goNext}
            >
              {t("msv2Next")}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function StepCard({
  open,
  title,
  titleId,
  answer,
  placeholder,
  onOpen,
  children,
}: {
  open: boolean;
  title: string;
  titleId?: string;
  answer: string;
  placeholder: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <button
        type="button"
        data-ke="msv2-closed"
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-bg px-4 text-left shadow-card"
        onClick={onOpen}
      >
        <span className="text-base font-semibold text-fg">{title}</span>
        <span className={cn("truncate text-base", answer ? "font-semibold text-fg" : "text-muted")}>
          {answer || placeholder}
        </span>
      </button>
    );
  }
  return (
    <section data-ke="msv2-open" className="rounded-3xl bg-bg p-4 shadow-card" aria-labelledby={titleId}>
      {children}
    </section>
  );
}

function ListButton({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl px-2 text-left" onClick={onClick}>
      <span className="text-base font-semibold text-fg">{label}</span>
      {hint ? <span className="text-base text-muted">{hint}</span> : null}
    </button>
  );
}

function Tab({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={cn("h-11 flex-1 rounded-full text-base font-semibold", on ? "bg-bg shadow-card" : "text-muted")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        "inline-flex h-11 items-center rounded-full px-3 text-base font-semibold",
        on ? "bg-primary text-primary-fg" : "bg-surface ring-1 ring-border",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={cn("ke-switch-track", on && "is-on")} aria-hidden>
        <span className="ke-switch-thumb" />
      </span>
    </button>
  );
}
