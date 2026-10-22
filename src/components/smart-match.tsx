import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AI_FLAGS } from "@/lib/ai/flags";
import { helpBubbleDistinctId } from "@/lib/ai/help-bubble";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import {
  pickSmartMatchResults,
  quizToFilters,
  resolveMatchPlaces,
  smartMatchEventProps,
  whyParts,
  type SmartMatchAge,
  type SmartMatchFilters,
} from "@/lib/ai/smart-match";
import {
  answersToQuiz,
  currentMatchStep,
  EMPTY_MATCH_ANSWERS,
  matchStartDate,
  parseAgeText,
  parsePriorityText,
  parseRadiusKm,
  parseScheduleText,
  parseStartText,
  rewindMatchAnswers,
  stripRadiusWords,
  wantsSubsidy,
  type MatchChatAnswers,
  type MatchRadius,
  type MatchScheduleChoice,
  type MatchStartChoice,
} from "@/lib/ai/smart-match-chat";
import { geocode } from "@/lib/geo";
import { capturePostHogEvent } from "@/lib/posthog";
import { searchDaycares } from "@/lib/server/daycares";
import { saveSearch } from "@/lib/server/saved-searches";
import { refineSmartMatch } from "@/lib/server/smart-match";
import type { CopyKey } from "@/lib/copy";
import type { DaycareCard } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { standardAgeLabel } from "@/lib/standard-age-groups";
import { cn } from "@/lib/utils";

const AGES: Array<{ id: SmartMatchAge; label: CopyKey }> = [
  { id: "infant", label: "infant" },
  { id: "toddler", label: "toddler" },
  { id: "preschool", label: "preschool" },
  { id: "school-age", label: "schoolAge" },
  { id: "any", label: "anyAge" },
];

const RADII: Array<{ km: MatchRadius; label: CopyKey }> = [
  { km: 5, label: "smartMatchRadius5" },
  { km: 10, label: "smartMatchRadius10" },
  { km: 25, label: "smartMatchRadius25" },
];

const STARTS: Array<{ id: MatchStartChoice; label: CopyKey }> = [
  { id: "soon", label: "smartMatchStartSoon" },
  { id: "next-month", label: "smartMatchStartMonth" },
  { id: "three-months", label: "smartMatchStartThree" },
];

const SCHEDULES: Array<{ id: MatchScheduleChoice; label: CopyKey }> = [
  { id: "full", label: "smartMatchFull" },
  { id: "part", label: "smartMatchPart" },
  { id: "weekdays", label: "smartMatchWeekdays" },
];

type Bubble = { who: "bot" | "user"; text: string };

function track(
  event: "smart_match_started" | "smart_match_completed" | "smart_match_result_clicked" | "smart_match_applied",
  props: Record<string, unknown> = {},
) {
  capturePostHogEvent(event, smartMatchEventProps(props));
}

function matchAgeText(age: SmartMatchAge, t: (key: CopyKey) => string, locale: string) {
  if (age === "any") return t("anyAge");
  return standardAgeLabel(age, locale);
}

function priorityLine(answers: MatchChatAnswers, t: (key: CopyKey) => string) {
  const bits: string[] = [];
  if (answers.budget === "ten") bits.push(t("smartMatchBudgetTen"));
  if (answers.subsidy) bits.push(t("smartMatchSubsidy"));
  if (answers.french) bits.push(t("smartMatchFrench"));
  if (answers.extraSupport) bits.push(t("smartMatchSupport"));
  if (!bits.length) bits.push(t("smartMatchBudgetAny"));
  return bits.join(" · ");
}

function matchBubbles(answers: MatchChatAnswers, t: (key: CopyKey) => string, locale: string): Bubble[] {
  const out: Bubble[] = [
    { who: "bot", text: t("smartMatchLead") },
    { who: "bot", text: t("smartMatchAge") },
  ];
  if (!answers.age) return out;
  out.push({ who: "user", text: matchAgeText(answers.age, t, locale) });
  out.push({ who: "bot", text: t("smartMatchBotPlace") });
  if (!answers.place.trim() && !answers.radiusKm) return out;
  const placeBits = [
    answers.place.trim(),
    answers.radiusKm ? t(RADII.find((item) => item.km === answers.radiusKm)?.label ?? "smartMatchRadius10") : "",
  ].filter(Boolean);
  out.push({ who: "user", text: placeBits.join(" · ") });
  if (!answers.place.trim() || !answers.radiusKm) return out;
  out.push({ who: "bot", text: t("smartMatchStart") });
  if (!answers.startChoice || (answers.startChoice === "date" && !answers.startDate)) return out;
  const startText =
    answers.startChoice === "date"
      ? answers.startDate
      : t(STARTS.find((item) => item.id === answers.startChoice)?.label ?? "smartMatchStartSoon");
  out.push({ who: "user", text: startText });
  out.push({ who: "bot", text: t("smartMatchBotSchedule") });
  if (!answers.schedule) return out;
  out.push({
    who: "user",
    text: t(SCHEDULES.find((item) => item.id === answers.schedule)?.label ?? "smartMatchFull"),
  });
  out.push({ who: "bot", text: t("smartMatchBotPriorities") });
  if (!answers.prioritiesDone) return out;
  out.push({ who: "user", text: priorityLine(answers, t) });
  return out;
}

export function SmartMatchEntry({ inline = false, quiet = false }: { inline?: boolean; quiet?: boolean }) {
  const { user } = useCurrentUserState();
  const { t } = useCopy();
  const on = useAiFeatureFlag(AI_FLAGS.smartMatch);
  const [open, setOpen] = useState(false);

  const button = quiet ? (
    <button
      type="button"
      className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
      onClick={() => setOpen(true)}
    >
      {t("smartMatchCta")}
    </button>
  ) : (
    <Button
      type="button"
      variant="secondary"
      className="whitespace-nowrap max-md:h-auto max-md:max-w-full max-md:whitespace-normal max-md:px-4 max-md:text-center"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
      onClick={() => setOpen(true)}
    >
      {t("smartMatchCta")}
    </Button>
  );

  return (
    <>
      {inline ? button : <div className="mt-3 flex justify-center">{button}</div>}
      {open ? <SmartMatchChat onClose={() => setOpen(false)} signedIn={Boolean(user)} visitorId={user?.id} /> : null}
    </>
  );
}

function SmartMatchChat({
  onClose,
  signedIn,
  visitorId,
}: {
  onClose: () => void;
  signedIn: boolean;
  visitorId?: string | null;
}) {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState<MatchChatAnswers>(EMPTY_MATCH_ANSWERS);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const [results, setResults] = useState<DaycareCard[]>([]);
  const [filters, setFilters] = useState<SmartMatchFilters | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [unknownPlace, setUnknownPlace] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const started = useRef(false);
  const step = currentMatchStep(answers);

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

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [answers, results, busy, hint]);

  useEffect(() => {
    if (step !== "results") return;
    const snapshot = answers;
    let cancel = false;
    setBusy(true);
    setSettled(false);
    setSaved(false);
    setSaveError(false);
    void (async () => {
      const quiz = answersToQuiz(snapshot);
      let next = quizToFilters(quiz);
      try {
        const refined = await refineSmartMatch({
          data: { ...quiz, distinctId: helpBubbleDistinctId(visitorId) },
        });
        next = refined.filters;
      } catch {
        next = quizToFilters(quiz);
      }
      if (cancel) return;
      setFilters(next);
      const places = resolveMatchPlaces(snapshot.place, "", geocode);
      if (!places) {
        setUnknownPlace(true);
        setOrigin(null);
        setResults([]);
        setBusy(false);
        setSettled(true);
        track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: 0 });
        return;
      }
      setUnknownPlace(false);
      setOrigin({ lat: places.lat, lng: places.lng, label: places.label });
      try {
        const found = await searchDaycares({
          data: {
            lat: places.lat,
            lng: places.lng,
            lat2: places.lat2,
            lng2: places.lng2,
            mode: places.lat2 != null ? "both" : "home",
            radiusKm: snapshot.radiusKm ?? 25,
            sort: "best",
            ageGroup: next.age === "any" || next.age === "school-age" ? "any" : next.age,
            rankAge: next.age,
            wantSubsidy: wantsSubsidy(snapshot),
            schedules: next.schedules,
            label: places.label,
            q: places.label,
            startDate: matchStartDate(snapshot),
            countDemand: true,
          },
        });
        if (cancel) return;
        const top = pickSmartMatchResults(found, next, 10);
        setResults(top);
        track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: top.length });
      } catch {
        if (cancel) return;
        setResults([]);
        track("smart_match_completed", { age_group: next.age, budget: next.budget, result_count: 0 });
      }
      if (cancel) return;
      setBusy(false);
      setSettled(true);
    })();
    return () => {
      cancel = true;
    };
  }, [answers, step, visitorId]);

  function patch(next: MatchChatAnswers) {
    setHint("");
    setDraft("");
    setSettled(false);
    setAnswers(next);
  }

  function onType(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || step === "results") return;
    if (step === "age") {
      const age = parseAgeText(text);
      if (!age) {
        setHint(t("smartMatchBotAgain"));
        return;
      }
      patch({ ...answers, age });
      return;
    }
    if (step === "place") {
      const radius = parseRadiusKm(text) ?? answers.radiusKm;
      const place = stripRadiusWords(text) || answers.place;
      if (!place && !radius) {
        setHint(t("smartMatchBotAgain"));
        return;
      }
      patch({ ...answers, place, radiusKm: radius });
      return;
    }
    if (step === "start") {
      const parsed = parseStartText(text);
      if (!parsed) {
        setHint(t("smartMatchBotAgain"));
        return;
      }
      patch({ ...answers, startChoice: parsed.choice, startDate: parsed.startDate });
      return;
    }
    if (step === "schedule") {
      const schedule = parseScheduleText(text);
      if (!schedule) {
        setHint(t("smartMatchBotAgain"));
        return;
      }
      patch({ ...answers, schedule });
      return;
    }
    const flags = parsePriorityText(text);
    if (!flags) {
      setHint(t("smartMatchBotAgain"));
      return;
    }
    patch({
      ...answers,
      budget: flags.budget ?? "any",
      subsidy: flags.subsidy,
      french: flags.french,
      extraSupport: flags.extraSupport,
      prioritiesDone: true,
    });
  }

  function onBack() {
    if (step === "age" && !answers.age) {
      onClose();
      return;
    }
    setHint("");
    setDraft("");
    setResults([]);
    setSettled(false);
    setAnswers(rewindMatchAnswers(answers));
  }

  function restart() {
    setHint("");
    setDraft("");
    setResults([]);
    setOrigin(null);
    setUnknownPlace(false);
    setSaved(false);
    setSettled(false);
    setAnswers({ ...EMPTY_MATCH_ANSWERS });
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
          radiusKm: answers.radiusKm ?? 25,
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

  const lines = matchBubbles(answers, t, locale);
  if (step === "results") {
    lines.push({
      who: "bot",
      text:
        busy || !settled
          ? t("smartMatchBotLooking")
          : unknownPlace
            ? t("smartMatchUnknownPlace")
            : results.length
              ? t("smartMatchBotResults")
              : t("smartMatchEmpty"),
    });
  }
  const searchPlace = origin?.label || answers.place.trim();

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("close")} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ke="smart-match-chat"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-bg shadow-card ring-1 ring-border outline-none md:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-display text-xl">
            {t("smartMatchTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <div ref={logRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {lines.map((line, index) => (
            <p
              key={`${line.who}-${index}`}
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-snug",
                line.who === "user" ? "self-end rounded-br-md bg-fg text-bg" : "self-start rounded-bl-md bg-surface text-fg ring-1 ring-border",
              )}
            >
              {line.text}
            </p>
          ))}
          {step === "results" && settled && !busy && results.length > 0 ? (
            <div className="space-y-2">
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
                        {Number.isFinite(item.distanceKm) ? ` · ${t("smartMatchKm").replace("{n}", item.distanceKm.toFixed(1))}` : ""}
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
                          className="block min-h-11 rounded-xl bg-surface px-3 py-3 ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                        <div className="rounded-xl bg-surface px-3 py-3 ring-1 ring-border">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
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
          ) : null}
        </div>
        <form
          onSubmit={onType}
          className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {hint ? (
            <p className="mb-2 text-sm text-muted" role="status">
              {hint}
            </p>
          ) : null}
          {step !== "results" ? (
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label={t("smartMatchTitle")}>
              {step === "age"
                ? AGES.map((item) => (
                    <Chip key={item.id} onClick={() => patch({ ...answers, age: item.id })}>
                      {item.id === "any" ? t(item.label) : standardAgeLabel(item.id, locale)}
                    </Chip>
                  ))
                : null}
              {step === "place"
                ? RADII.map((item) => (
                    <Chip
                      key={item.km}
                      pressed={answers.radiusKm === item.km}
                      onClick={() => patch({ ...answers, radiusKm: item.km })}
                    >
                      {t(item.label)}
                    </Chip>
                  ))
                : null}
              {step === "start"
                ? STARTS.map((item) => (
                    <Chip key={item.id} onClick={() => patch({ ...answers, startChoice: item.id, startDate: "" })}>
                      {t(item.label)}
                    </Chip>
                  ))
                : null}
              {step === "schedule"
                ? SCHEDULES.map((item) => (
                    <Chip key={item.id} onClick={() => patch({ ...answers, schedule: item.id })}>
                      {t(item.label)}
                    </Chip>
                  ))
                : null}
              {step === "priorities" ? (
                <>
                  <Chip onClick={() => patch({ ...answers, budget: "ten", prioritiesDone: true })}>{t("smartMatchBudgetTen")}</Chip>
                  <Chip onClick={() => patch({ ...answers, subsidy: true, budget: answers.budget ?? "any", prioritiesDone: true })}>
                    {t("smartMatchSubsidy")}
                  </Chip>
                  <Chip onClick={() => patch({ ...answers, french: true, budget: answers.budget ?? "any", prioritiesDone: true })}>
                    {t("smartMatchFrench")}
                  </Chip>
                  <Chip onClick={() => patch({ ...answers, extraSupport: true, budget: answers.budget ?? "any", prioritiesDone: true })}>
                    {t("smartMatchSupport")}
                  </Chip>
                  <Chip onClick={() => patch({ ...answers, budget: "any", prioritiesDone: true })}>{t("smartMatchBudgetAny")}</Chip>
                </>
              ) : null}
            </div>
          ) : null}
          {step !== "results" ? (
            <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-1 ring-1 ring-border">
              <label htmlFor="smart-match-reply" className="sr-only">
                {t("smartMatchTypeAnswer")}
              </label>
              <input
                id="smart-match-reply"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                placeholder={step === "place" ? t("smartMatchHome") : t("smartMatchTypeAnswer")}
                autoComplete={step === "place" ? "address-level2" : "off"}
                className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
              />
              <button
                type="submit"
                aria-label={t("send")}
                disabled={!draft.trim()}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
              >
                <ArrowUp className="size-5" aria-hidden />
              </button>
            </div>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="secondary" onClick={onBack}>
              {t("back")}
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              {t("smartMatchRestart")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  pressed = false,
}: {
  children: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        pressed ? "bg-fg text-bg" : "bg-surface text-fg ring-1 ring-border",
      )}
    >
      {children}
    </button>
  );
}
