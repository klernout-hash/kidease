import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionDesks } from "@/components/session-desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  CHECKLIST_PARENT,
  CHECKLIST_PROVIDER,
  EMPTY_EXAMPLES,
  SETUP_CALL_URL,
  TOURS,
  UI_COPY,
  WELCOME_PARENT,
  WELCOME_PROVIDER,
  canDismissChecklist,
  checklistOpen,
  isOnboardingKey,
  onboardingPlace,
  parentProgressLabel,
  parentQuickStart,
  placeCoachBubble,
  presentCoachSteps,
  pickCopy,
  providerSetup,
  readinessLabel,
  searchGuide,
  shouldAutoShow,
  stepAnchors,
  welcomeSlides,
  blocksAutoTour,
  type ChecklistResult,
  type FirstRunLocale,
  type OnboardingKey,
  type TourKey,
} from "@/lib/first-run";
import {
  REPLAY_EVENT,
  clearForcedChecklist,
  forceChecklist,
  forcedChecklist,
  hydrateOnboarding,
  loadFirstRunFlag,
  pullOnboarding,
  rememberDismissed,
  rememberSeen,
  requestReplay,
  setOnboardingSignedIn,
  useFirstRunFlag,
  useOnboardingState,
} from "@/lib/first-run-client";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { getParentQuickFacts, getProviderSetupFacts } from "@/lib/server/first-run";
import { useRoleChrome } from "@/components/role-chrome";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function localeOf(locale: string): FirstRunLocale {
  return locale === "fr" ? "fr" : "en";
}

function findTarget(anchors: readonly string[]): HTMLElement | null {
  for (const selector of anchors) {
    for (const node of document.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      return node;
    }
  }
  return null;
}

function CallLink({ locale }: { locale: FirstRunLocale }) {
  return (
    <a
      href={SETUP_CALL_URL}
      data-ke="book-a-call"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {pickCopy(locale, UI_COPY.call)}
    </a>
  );
}

export function AnchoredCoach({
  steps,
  marker,
  audience,
  onClose,
}: {
  steps: ReadonlyArray<{ anchor?: string; anchors?: readonly string[]; title: { en: string; fr: string }; body: { en: string; fr: string } }>;
  marker: string;
  audience?: "parent" | "provider";
  onClose: (reason?: "skip" | "done") => void;
}) {
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const titleId = useId();
  const bodyId = useId();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const scans = useRef(0);
  const [index, setIndex] = useState(0);
  const [live, setLive] = useState<typeof steps | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; arrow: "up" | "down" } | null>(null);

  useEffect(() => {
    let stop = false;
    const scan = () => {
      if (stop) return;
      scans.current += 1;
      setLive(presentCoachSteps(steps, (selector) => findTarget([selector]) != null));
    };
    scan();
    const timers = [250, 900].map((ms) => window.setTimeout(scan, ms));
    window.addEventListener("resize", scan);
    return () => {
      stop = true;
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", scan);
    };
  }, [steps]);

  useEffect(() => {
    if (live && live.length === 0 && scans.current >= 3) closeRef.current();
  }, [live]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current("skip");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const shown = live ?? [];
  const safeIndex = shown.length ? Math.min(index, shown.length - 1) : 0;
  const step = shown[safeIndex];
  const scrolledFor = useRef<number | null>(null);

  useIsoLayout(() => {
    if (!step) return;
    const node = findTarget(stepAnchors(step));
    if (!node) {
      setSpot(null);
      return;
    }
    // Scroll once per step. Rescans (timers, phone toolbar resize) must not yank the page mid-scroll.
    if (scrolledFor.current !== safeIndex) {
      scrolledFor.current = safeIndex;
      node.scrollIntoView({ block: "center", inline: "nearest" });
    }
    const rect = node.getBoundingClientRect();
    const nextSpot = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    setSpot(nextSpot);
    const bubble = bubbleRef.current?.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    const height = bubble && bubble.height > 40 ? bubble.height : 168;
    setPlace(placeCoachBubble(nextSpot, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [step, safeIndex, live]);

  if (!live || !step || !spot || !place) return null;
  const last = safeIndex >= shown.length - 1;
  const arrowX = Math.max(16, Math.min(spot.left + spot.width / 2 - place.left - 8, place.width - 28));
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" data-ke="first-run-scrim">
      <div
        data-ke="coach-hole"
        className="pointer-events-none fixed rounded-xl"
        style={{
          top: Math.max(4, spot.top - 6),
          left: Math.max(4, spot.left - 6),
          width: spot.width + 12,
          height: spot.height + 12,
          boxShadow: "0 0 0 100vmax color-mix(in srgb, var(--color-fg) 46%, transparent)",
        }}
      />
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-ke={marker}
        data-audience={audience}
        data-step={safeIndex + 1}
        data-steps={shown.length}
        data-locale={locale}
        className="pointer-events-auto fixed max-w-[calc(100%-1.5rem)] rounded-xl bg-surface p-3 text-fg shadow-card ring-1 ring-border"
        style={{ top: place.top, left: place.left, width: place.width }}
      >
        <span
          aria-hidden
          className="absolute h-0 w-0"
          style={
            place.arrow === "up"
              ? {
                  left: arrowX,
                  top: -8,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderBottom: "8px solid var(--color-surface)",
                }
              : {
                  left: arrowX,
                  bottom: -8,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "8px solid var(--color-surface)",
                }
          }
        />
        <h2 id={titleId} className="text-base font-semibold leading-5 text-balance">
          {pickCopy(locale, step.title)}
        </h2>
        <p id={bodyId} className="mt-1 text-sm leading-5 text-muted">
          {pickCopy(locale, step.body)}
        </p>
        <div className="mt-2 flex items-center gap-1" data-ke="coach-dots" aria-hidden>
          {shown.map((item, dot) => (
            <span
              key={stepAnchors(item)[0] ?? dot}
              className={dot === safeIndex ? "h-1.5 w-4 rounded-full bg-primary" : "size-1.5 rounded-full bg-border"}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {safeIndex > 0 ? (
            <Button type="button" variant="ghost" data-ke="first-run-back" onClick={() => setIndex((n) => Math.max(0, n - 1))}>
              {pickCopy(locale, UI_COPY.back)}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" data-ke="first-run-skip" onClick={() => onClose("skip")}>
            {pickCopy(locale, UI_COPY.skip)}
          </Button>
          <Button
            type="button"
            data-ke="first-run-next"
            onClick={() => {
              if (last) onClose("done");
              else setIndex((n) => n + 1);
            }}
          >
            {pickCopy(locale, last ? UI_COPY.done : UI_COPY.next)}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function WelcomeWalkthrough({
  tourKey,
  onClose,
}: {
  tourKey: typeof WELCOME_PARENT | typeof WELCOME_PROVIDER;
  onClose: (reason?: "skip" | "done") => void;
}) {
  return (
    <AnchoredCoach
      steps={welcomeSlides(tourKey)}
      marker="first-run-welcome"
      audience={tourKey === WELCOME_PROVIDER ? "provider" : "parent"}
      onClose={onClose}
    />
  );
}

export function CoachTour({ tourKey, onClose }: { tourKey: TourKey; onClose: (reason?: "skip" | "done") => void }) {
  return <AnchoredCoach steps={TOURS[tourKey]} marker="coach-tour" onClose={onClose} />;
}

function setupStepVisible(role: string | null | undefined, id: string): boolean {
  if (!role || role === "owner") return true;
  if (role === "read_only") return false;
  if (role === "staff") return id === "openings" || id === "tours";
  return id !== "payouts" && id !== "staff";
}

function ChecklistCard({
  result,
  onHide,
}: {
  result: ChecklistResult;
  onHide: () => void;
}) {
  const { locale: raw } = useCopy();
  const { session } = useSessionDesks();
  const locale = localeOf(raw);
  const provider = result.id === CHECKLIST_PROVIDER;
  const steps = provider ? result.steps.filter((step) => setupStepVisible(session?.centreRole, step.id)) : result.steps;
  const title = provider ? readinessLabel(locale, result.percent) : pickCopy(locale, UI_COPY.parentList);
  const lead = provider ? pickCopy(locale, UI_COPY.providerListLead) : pickCopy(locale, UI_COPY.parentListLead);
  const count = provider ? `${result.percent}%` : parentProgressLabel(locale, result.done, result.total);
  return (
    <section
      className="mx-4 mb-4 max-w-3xl rounded-xl bg-surface p-4 text-fg shadow-card ring-1 ring-border"
      data-ke={provider ? "provider-setup" : "parent-setup"}
      data-percent={result.percent}
      data-complete={result.complete ? "true" : "false"}
      aria-labelledby="first-run-checklist-title"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-run-checklist-title" className="text-base font-semibold text-balance">
          {title}
        </h2>
        <p className="text-sm tabular-nums text-muted">{count}</p>
      </div>
      <p className="mt-1 text-sm text-muted">{lead}</p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={result.percent}
        aria-label={title}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${result.percent}%` }} />
      </div>
      <ul className="mt-3 grid gap-2">
        {steps.map((step) => (
          <li key={step.id}>
            <a
              href={localePath(step.href, locale)}
              data-ke={provider ? "provider-setup-step" : "parent-setup-step"}
              data-step={step.id}
              data-done={step.done ? "true" : "false"}
              className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className={step.done ? "text-primary" : "text-muted"} aria-hidden>
                {step.done ? "✓" : "○"}
              </span>
              <span className={step.done ? "text-fg" : "text-muted"}>{pickCopy(locale, step.label)}</span>
            </a>
          </li>
        ))}
      </ul>
      {provider ? (
        <a
          href={localePath("/provider?desk=documents", locale)}
          data-ke="provider-documents-link"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {locale === "fr" ? "Documents du centre" : "Centre documents"}
        </a>
      ) : null}
      {canDismissChecklist(result.id, result.complete) ? (
        <Button type="button" variant="ghost" className="mt-2" data-ke="checklist-hide" onClick={onHide}>
          {pickCopy(locale, UI_COPY.hideList)}
        </Button>
      ) : null}
    </section>
  );
}

export function FirstRunExample({ id }: { id: string }) {
  const enabled = useFirstRunFlag();
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const example = EMPTY_EXAMPLES[id];
  useEffect(() => {
    void loadFirstRunFlag();
  }, []);
  if (enabled !== true || !example) return null;
  return (
    <div className="mt-3 text-sm" data-ke="first-run-example" data-example={id}>
      <p className="text-muted">{pickCopy(locale, example.body)}</p>
      <a
        href={localePath(example.href, locale)}
        className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
      >
        {pickCopy(locale, example.action)}
      </a>
    </div>
  );
}

export function HelpGuide() {
  const enabled = useFirstRunFlag();
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<"parent" | "provider" | "all">("all");
  useEffect(() => {
    void loadFirstRunFlag();
  }, []);
  if (enabled !== true) return null;
  const articles = searchGuide(query, audience === "all" ? undefined : audience);
  return (
    <section className="mt-8" data-ke="help-guide" aria-labelledby="help-guide-title">
      <h2 id="help-guide-title" className="font-display text-2xl">
        {pickCopy(locale, UI_COPY.guideTitle)}
      </h2>
      <p className="mt-2 text-muted">{pickCopy(locale, UI_COPY.guideLead)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" data-ke="replay-welcome" data-tour-key={WELCOME_PARENT} onClick={() => requestReplay(WELCOME_PARENT)}>
          {pickCopy(locale, UI_COPY.takeTour)}
        </Button>
        <Button type="button" variant="ghost" data-ke="replay-welcome" data-tour-key={WELCOME_PROVIDER} onClick={() => requestReplay(WELCOME_PROVIDER)}>
          {locale === "fr" ? "Visite du centre" : "Centre tour"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={pickCopy(locale, UI_COPY.guideTitle)}>
        {(
          [
            ["all", locale === "fr" ? "Tout" : "All"],
            ["parent", pickCopy(locale, UI_COPY.parents)],
            ["provider", pickCopy(locale, UI_COPY.providers)],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={audience === id}
            data-ke={`help-audience-${id}`}
            className={cn(
              "min-h-11 rounded-full px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              audience === id ? "bg-primary text-primary-fg" : "bg-surface text-fg ring-1 ring-border",
            )}
            onClick={() => setAudience(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium">
        {pickCopy(locale, UI_COPY.search)}
        <input
          className="ke-input mt-1"
          data-ke="help-guide-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
        />
      </label>
      <ul className="mt-4 space-y-3">
        {articles.length === 0 ? (
          <li className="text-sm text-muted" data-ke="help-guide-empty">
            {pickCopy(locale, UI_COPY.noArticle)}
          </li>
        ) : (
          articles.map((article) => (
            <li key={article.id} className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="help-article">
              <h3 className="font-medium">{pickCopy(locale, article.title)}</h3>
              <p className="mt-2 text-sm leading-5 text-muted">{pickCopy(locale, article.body)}</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                data-ke="replay-tour"
                data-tour-key={article.replay}
                onClick={() => requestReplay(article.replay)}
              >
                {pickCopy(locale, UI_COPY.replay)}
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="mt-4">
        <CallLink locale={locale} />
      </p>
    </section>
  );
}

export function FirstRunHelpButton() {
  const enabled = useFirstRunFlag();
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  useEffect(() => {
    void loadFirstRunFlag();
  }, []);
  if (enabled !== true) return null;
  return (
    <a
      href={localePath("/help", locale)}
      data-ke="help-button"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-sm font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation"
    >
      <CircleHelp className="size-5" aria-hidden />
      <span>{pickCopy(locale, UI_COPY.help)}</span>
    </a>
  );
}

export function FirstRunMenuLinks() {
  const enabled = useFirstRunFlag();
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  useEffect(() => {
    void loadFirstRunFlag();
  }, []);
  if (enabled !== true) return null;
  const params = new URLSearchParams(searchStr);
  const place = onboardingPlace({
    pathname: stripLocalePrefix(pathname) === "/menu" ? "/" : pathname,
    desk: params.get("desk"),
    tab: params.get("tab"),
    view: params.get("view"),
  });
  const tour = place.welcome ?? WELCOME_PARENT;
  return (
    <div className="mt-3 flex flex-col gap-2" data-ke="first-run-menu">
      <a
        href={localePath("/help", locale)}
        data-ke="menu-help"
        className="flex min-h-11 items-center rounded-lg px-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {pickCopy(locale, UI_COPY.help)}
      </a>
      <button
        type="button"
        data-ke="take-the-tour"
        className="flex min-h-11 items-center rounded-lg px-1 text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => requestReplay(tour)}
      >
        {pickCopy(locale, UI_COPY.takeTour)}
      </button>
    </div>
  );
}

function useReadyFlag() {
  const enabled = useFirstRunFlag();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateOnboarding();
    void loadFirstRunFlag().finally(() => setReady(true));
  }, []);
  return { enabled, ready };
}

export function FirstRunHost() {
  const { enabled, ready } = useReadyFlag();
  const progress = useOnboardingState();
  const { user } = useCurrentUserState();
  const chrome = useRoleChrome();
  const blocked = blocksAutoTour(chrome.role);
  const screenTourReady = useRef<boolean | null>(null);
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const [forced, setForced] = useState<OnboardingKey | null>(null);
  const [providerFacts, setProviderFacts] = useState<ChecklistResult | null>(null);
  const [parentFacts, setParentFacts] = useState<ChecklistResult | null>(null);
  const params = new URLSearchParams(searchStr);
  const place = onboardingPlace({
    pathname,
    desk: params.get("desk"),
    tab: params.get("tab"),
    view: params.get("view"),
  });

  useEffect(() => {
    setOnboardingSignedIn(Boolean(user?.id));
    if (user?.id && enabled === true) void pullOnboarding();
  }, [user?.id, enabled]);

  useEffect(() => {
    function onReplay(event: Event) {
      const key = (event as CustomEvent<string>).detail;
      if (!isOnboardingKey(key)) return;
      if (key !== CHECKLIST_PARENT && key !== CHECKLIST_PROVIDER && key !== WELCOME_PARENT && key !== WELCOME_PROVIDER && !(key in TOURS)) {
        return;
      }
      if (key === CHECKLIST_PARENT || key === CHECKLIST_PROVIDER) {
        forceChecklist(key);
        const next = key === CHECKLIST_PROVIDER ? "/provider?desk=today" : "/parent";
        window.location.assign(localePath(next, locale));
        return;
      }
      setForced(key);
    }
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [locale]);

  useEffect(() => {
    if (enabled !== true || !user?.id) return;
    if (place.checklist === CHECKLIST_PROVIDER) {
      void getProviderSetupFacts()
        .then((facts) => setProviderFacts(providerSetup(facts)))
        .catch(() => setProviderFacts(null));
    }
    if (place.checklist === CHECKLIST_PARENT) {
      void getParentQuickFacts()
        .then((facts) => setParentFacts(parentQuickStart(facts)))
        .catch(() => setParentFacts(null));
    }
  }, [enabled, user?.id, place.checklist, pathname, searchStr]);

  if (ready && enabled === true && screenTourReady.current === null) {
    screenTourReady.current = !place.welcome || !shouldAutoShow(progress, place.welcome);
  }

  if (!ready || enabled !== true) return null;

  const replayWelcome = forced === WELCOME_PARENT || forced === WELCOME_PROVIDER ? forced : null;
  const replayTour = forced != null && forced in TOURS ? (forced as TourKey) : null;
  const welcomeKey = replayWelcome ?? place.welcome;
  const showWelcome =
    replayTour == null &&
    welcomeKey != null &&
    (replayWelcome != null || (!blocked && shouldAutoShow(progress, welcomeKey)));
  const tourKey = replayTour ?? place.tour;
  const showTour =
    tourKey != null &&
    !showWelcome &&
    (replayTour != null || (!blocked && screenTourReady.current === true && shouldAutoShow(progress, tourKey) && !shouldAutoShow(progress, place.welcome)));

  const checklist =
    place.checklist === CHECKLIST_PROVIDER
      ? providerFacts
      : place.checklist === CHECKLIST_PARENT
        ? parentFacts
        : null;
  const showChecklist =
    checklist != null && (forcedChecklist() === checklist.id || checklistOpen(progress, checklist.id));

  // Skip means skip: no other tour pops up later on this device.
  function skipAllTours() {
    for (const key of Object.keys(TOURS)) rememberSeen(key);
  }
  function closeWelcome(reason?: "skip" | "done") {
    if (welcomeKey) rememberSeen(welcomeKey);
    if (reason === "skip") skipAllTours();
    setForced(null);
  }
  function closeTour(reason?: "skip" | "done") {
    if (tourKey) rememberSeen(tourKey);
    if (reason === "skip") skipAllTours();
    setForced(null);
  }

  const checklistNode: ReactNode =
    showChecklist && checklist ? (
      <ChecklistCard
        result={checklist}
        onHide={() => {
          if (!canDismissChecklist(checklist.id, checklist.complete)) return;
          clearForcedChecklist();
          rememberDismissed(checklist.id);
        }}
      />
    ) : null;

  return (
    <>
      {checklistNode ? <ChecklistSlot>{checklistNode}</ChecklistSlot> : null}
      {showWelcome && welcomeKey && (welcomeKey === WELCOME_PARENT || welcomeKey === WELCOME_PROVIDER) ? (
        <WelcomeWalkthrough tourKey={welcomeKey} onClose={closeWelcome} />
      ) : null}
      {showTour && tourKey ? <CoachTour tourKey={tourKey} onClose={closeTour} /> : null}
    </>
  );
}

function ChecklistSlot({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPage(document.querySelector<HTMLElement>("[data-ke=page]"));
  }, []);
  if (!page) return null;
  return <ChecklistPortal page={page}>{children}</ChecklistPortal>;
}

function ChecklistPortal({ page, children }: { page: HTMLElement; children: ReactNode }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useIsoLayout(() => {
    const el = document.createElement("div");
    el.dataset.ke = "first-run-checklist-slot";
    page.insertBefore(el, page.firstChild);
    host.current = el;
    setNode(el);
    return () => {
      el.remove();
    };
  }, [page]);
  if (!node) return null;
  return <PortalInto node={node}>{children}</PortalInto>;
}

function PortalInto({ node, children }: { node: HTMLElement; children: ReactNode }) {
  return createPortal(children, node);
}
