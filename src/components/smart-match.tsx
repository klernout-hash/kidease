import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AI_FLAGS } from "@/lib/ai/flags";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import {
  pickSmartMatchResults,
  quizToFilters,
  resolveMatchPlaces,
  smartMatchEventProps,
  whyParts,
  type SmartMatchAge,
  type SmartMatchBudget,
  type SmartMatchFilters,
} from "@/lib/ai/smart-match";
import { geocode } from "@/lib/geo";
import { capturePostHogEvent } from "@/lib/posthog";
import { searchDaycares } from "@/lib/server/daycares";
import { saveSearch } from "@/lib/server/saved-searches";
import { refineSmartMatch } from "@/lib/server/smart-match";
import type { CopyKey } from "@/lib/copy";
import type { DaycareCard } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

const AGES: Array<{ id: SmartMatchAge; label: CopyKey }> = [
  { id: "infant", label: "infant" },
  { id: "toddler", label: "toddler" },
  { id: "preschool", label: "preschool" },
  { id: "school-age", label: "schoolAge" },
  { id: "any", label: "anyAge" },
];

function track(event: "smart_match_started" | "smart_match_completed" | "smart_match_result_clicked" | "smart_match_applied", props: Record<string, unknown> = {}) {
  capturePostHogEvent(event, smartMatchEventProps(props));
}

export function SmartMatchEntry() {
  const { user } = useCurrentUserState();
  const { t } = useCopy();
  const on = useAiFeatureFlag(AI_FLAGS.smartMatch);
  const [open, setOpen] = useState(false);

  if (!on) return null;

  return (
    <>
      <div className="mt-3">
        <Button type="button" variant="secondary" data-ke="smart-match-open" onClick={() => setOpen(true)}>
          {t("smartMatchCta")}
        </Button>
      </div>
      {open ? <SmartMatchSheet onClose={() => setOpen(false)} signedIn={Boolean(user)} /> : null}
    </>
  );
}

function SmartMatchSheet({ onClose, signedIn }: { onClose: () => void; signedIn: boolean }) {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [age, setAge] = useState<SmartMatchAge>("any");
  const [startDate, setStartDate] = useState("");
  const [home, setHome] = useState("");
  const [work, setWork] = useState("");
  const [budget, setBudget] = useState<SmartMatchBudget>("any");
  const [french, setFrench] = useState(false);
  const [fullTime, setFullTime] = useState(false);
  const [partTime, setPartTime] = useState(false);
  const [extraSupport, setExtraSupport] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"quiz" | "results">("quiz");
  const [results, setResults] = useState<DaycareCard[]>([]);
  const [filters, setFilters] = useState<SmartMatchFilters | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [unknownPlace, setUnknownPlace] = useState(false);
  const [usedAnswers, setUsedAnswers] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("smart_match_started");
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function seeMatches() {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setSaveError(false);
    const quiz = { age, budget, french, fullTime, partTime, extraSupport, note };
    let next = quizToFilters(quiz);
    let source: "quiz" | "note" = "quiz";
    try {
      const refined = await refineSmartMatch({ data: quiz });
      next = refined.filters;
      source = refined.source;
    } catch {
      next = quizToFilters(quiz);
      source = "quiz";
    }
    setFilters(next);
    setUsedAnswers(Boolean(note.trim()) && source === "quiz");
    const places = resolveMatchPlaces(home, work, geocode);
    if (!places) {
      setUnknownPlace(true);
      setOrigin(null);
      setPlaceLabel("");
      setResults([]);
      setPhase("results");
      setBusy(false);
      track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: 0 });
      return;
    }
    setUnknownPlace(false);
    setOrigin({ lat: places.lat, lng: places.lng, label: places.label });
    setPlaceLabel(places.label);
    try {
      const found = await searchDaycares({
        data: {
          lat: places.lat,
          lng: places.lng,
          lat2: places.lat2,
          lng2: places.lng2,
          mode: places.lat2 != null ? "both" : "home",
          radiusKm: 25,
          sort: "best",
          ageGroup: next.age === "any" || next.age === "school-age" ? "any" : next.age,
          rankAge: next.age,
          wantSubsidy: next.budget === "ten",
          schedules: next.schedules,
          label: places.label,
          q: places.label,
          startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
          countDemand: true,
        },
      });
      const top = pickSmartMatchResults(found, next, 10);
      setResults(top);
      track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: top.length });
    } catch {
      setResults([]);
      track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: 0 });
    }
    setPhase("results");
    setBusy(false);
  }

  async function save() {
    if (!origin || saved) return;
    setSaveError(false);
    try {
      await saveSearch({
        data: {
          name: `Match · ${origin.label}`.slice(0, 80),
          centerLat: origin.lat,
          centerLng: origin.lng,
          centerLabel: origin.label,
          radiusKm: 25,
          ageBand: filters?.age ?? "any",
          filters: {
            ten: filters?.budget === "ten",
            inclusive: Boolean(filters?.extraSupport),
          },
        },
      });
      setSaved(true);
      track("smart_match_applied", { age_group: filters?.age, budget: filters?.budget, result_count: results.length });
    } catch {
      setSaveError(true);
    }
  }

  const searchPlace = placeLabel || home.trim() || work.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("close")} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ke="smart-match-sheet"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-card ring-1 ring-border outline-none md:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="font-display text-xl">
              {t("smartMatchTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {phase === "quiz" ? t("smartMatchStep").replace("{n}", String(step + 1)) : t("smartMatchLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {phase === "quiz" ? (
            <>
              <p className="text-sm text-muted">{t("smartMatchLead")}</p>
              {step === 0 ? (
                <fieldset>
                  <legend className="text-sm font-medium">{t("smartMatchAge")}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AGES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={age === item.id}
                        className={`min-h-11 rounded-full px-4 text-sm ring-1 ring-border ${age === item.id ? "bg-primary text-primary-fg" : "bg-surface"}`}
                        onClick={() => setAge(item.id)}
                      >
                        {t(item.label)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {step === 1 ? (
                <label className="block text-sm font-medium">
                  {t("smartMatchStart")}
                  <input
                    type="date"
                    className="ke-input mt-2 w-full"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                  />
                  <span className="mt-1 block font-normal text-muted">{t("smartMatchStartHint")}</span>
                </label>
              ) : null}
              {step === 2 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{t("smartMatchPlaces")}</p>
                  <label className="block text-sm">
                    {t("smartMatchHome")}
                    <input
                      className="ke-input mt-1 w-full"
                      autoComplete="address-level2"
                      value={home}
                      onChange={(event) => setHome(event.target.value)}
                      onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                    />
                  </label>
                  <label className="block text-sm">
                    {t("smartMatchWork")}
                    <input
                      className="ke-input mt-1 w-full"
                      autoComplete="address-level2"
                      value={work}
                      onChange={(event) => setWork(event.target.value)}
                      onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                    />
                  </label>
                  <p className="text-sm text-muted">{t("smartMatchPlacesHint")}</p>
                </div>
              ) : null}
              {step === 3 ? (
                <fieldset>
                  <legend className="text-sm font-medium">{t("smartMatchBudget")}</legend>
                  <div className="mt-2 flex flex-col gap-2">
                    {(
                      [
                        ["any", "smartMatchBudgetAny"],
                        ["ten", "smartMatchBudgetTen"],
                      ] as const
                    ).map(([id, key]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={budget === id}
                        className={`min-h-11 rounded-full px-4 text-left text-sm ring-1 ring-border ${budget === id ? "bg-primary text-primary-fg" : "bg-surface"}`}
                        onClick={() => setBudget(id)}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {step === 4 ? (
                <div className="space-y-3">
                  <fieldset>
                    <legend className="text-sm font-medium">{t("smartMatchMusts")}</legend>
                    <div className="mt-2 space-y-2">
                      {(
                        [
                          [french, setFrench, "smartMatchFrench"],
                          [fullTime, setFullTime, "smartMatchFull"],
                          [partTime, setPartTime, "smartMatchPart"],
                          [extraSupport, setExtraSupport, "smartMatchSupport"],
                        ] as const
                      ).map(([on, set, key]) => (
                        <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
                          <input type="checkbox" className="size-5" checked={on} onChange={(event) => set(event.target.checked)} />
                          {t(key)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-sm">
                    {t("smartMatchNote")}
                    <textarea
                      className="ke-input mt-1 min-h-24 w-full"
                      maxLength={400}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                    />
                    <span className="mt-1 block text-muted">{t("smartMatchNoteHint")}</span>
                  </label>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-3" aria-live="polite">
              {usedAnswers ? <p className="text-sm text-muted">{t("smartMatchUsedAnswers")}</p> : null}
              {unknownPlace ? <p className="text-sm">{t("smartMatchUnknownPlace")}</p> : null}
              {!unknownPlace && results.length === 0 ? <p className="text-sm">{t("smartMatchEmpty")}</p> : null}
              {results.length > 0 ? (
                <>
                  <p className="text-sm text-muted">{t("smartMatchResults").replace("{n}", String(results.length))}</p>
                  <ul className="space-y-2">
                    {results.map((item, index) => {
                      const title = locale === "fr" && item.nameFr ? item.nameFr : item.name;
                      const why = whyParts(item.smartMatchWhy)
                        .map((part) => {
                          let line = t(part.key as CopyKey);
                          if (part.who) line = line.replace("{who}", t(part.who as CopyKey));
                          if (part.n) line = line.replace("{n}", part.n);
                          return line;
                        })
                        .filter(Boolean)
                        .join(" · ");
                      const body = (
                        <>
                          <span className="block font-medium">{title}</span>
                          <span className="mt-0.5 block text-sm text-muted">
                            {item.city}
                            {Number.isFinite(item.distanceKm)
                              ? ` · ${t("smartMatchKm").replace("{n}", item.distanceKm.toFixed(1))}`
                              : ""}
                          </span>
                          {why ? <span className="mt-1 block text-sm">{why}</span> : null}
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {item.slug ? (
                            <Link
                              to="/daycare/$slug"
                              params={{ slug: item.slug }}
                              className="block min-h-11 rounded-xl bg-bg px-3 py-3 ring-1 ring-border"
                              onClick={() =>
                                track("smart_match_result_clicked", {
                                  listing_id: item.id,
                                  position: index + 1,
                                  age_group: filters?.age,
                                  budget: filters?.budget,
                                })
                              }
                            >
                              {body}
                            </Link>
                          ) : (
                            <div className="rounded-xl bg-bg px-3 py-3 ring-1 ring-border">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              {origin && signedIn ? (
                <div>
                  <Button type="button" variant="secondary" disabled={saved} onClick={() => void save()}>
                    {saved ? t("smartMatchSaved") : t("smartMatchSave")}
                  </Button>
                  {saveError ? <p className="mt-2 text-sm text-danger">{t("smartMatchSaveFailed")}</p> : null}
                </div>
              ) : null}
              {origin && !signedIn ? (
                <Link to="/login" search={parentLoginSearch("/search")} className="inline-flex min-h-11 items-center text-sm underline">
                  {t("smartMatchSignIn")}
                </Link>
              ) : null}
              {searchPlace ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-sm underline"
                  onClick={() => {
                    onClose();
                    void navigate({ to: "/search", search: { q: searchPlace } });
                  }}
                >
                  {t("smartMatchSearchInstead")}
                </button>
              ) : null}
            </div>
          )}
        </div>
        {phase === "quiz" ? (
          <div className="flex gap-2 border-t border-border px-5 py-4">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((value) => value - 1)}>
                {t("back")}
              </Button>
            ) : null}
            {step < 4 ? (
              <Button type="button" onClick={() => setStep((value) => value + 1)}>
                {t("smartMatchNext")}
              </Button>
            ) : (
              <Button type="button" disabled={busy} onClick={() => void seeMatches()}>
                {busy ? t("smartMatchWorking") : t("smartMatchSee")}
              </Button>
            )}
          </div>
        ) : (
          <div className="border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={() => setPhase("quiz")}>
              {t("back")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
