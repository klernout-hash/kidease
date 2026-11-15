import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  pickCopy,
  providerSetup,
  readinessLabel,
  searchGuide,
  shouldAutoShow,
  stepCounter,
  welcomeSlides,
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
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function localeOf(locale: string): FirstRunLocale {
  return locale === "fr" ? "fr" : "en";
}

function useFocusTrap(open: boolean, onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.focus();
    function items() {
      if (!node) return [];
      return Array.from(node.querySelectorAll<HTMLElement>("button, a[href], input")).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
      );
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);
  return ref;
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

export function WelcomeWalkthrough({
  tourKey,
  onClose,
}: {
  tourKey: typeof WELCOME_PARENT | typeof WELCOME_PROVIDER;
  onClose: () => void;
}) {
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const slides = welcomeSlides(tourKey);
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const bodyId = useId();
  const ref = useFocusTrap(true, onClose);
  const slide = slides[index] ?? slides[0];
  const last = index >= slides.length - 1;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-fg/40 p-3 sm:place-items-center" data-ke="first-run-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-ke="first-run-welcome"
        data-audience={tourKey === WELCOME_PROVIDER ? "provider" : "parent"}
        data-step={index + 1}
        data-locale={locale}
        className="w-full max-w-md rounded-xl bg-surface p-5 text-fg shadow-card ring-1 ring-border outline-none"
      >
        <p className="text-sm font-medium text-primary">{pickCopy(locale, UI_COPY.welcomeLabel)}</p>
        <p className="mt-2 text-sm text-muted">{stepCounter(locale, index, slides.length)}</p>
        <h2 id={titleId} className="mt-2 font-display text-2xl text-balance">
          {pickCopy(locale, slide.title)}
        </h2>
        <p id={bodyId} className="mt-3 text-base leading-6 text-muted">
          {pickCopy(locale, slide.body)}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            data-ke="first-run-next"
            className="w-full"
            onClick={() => {
              if (last) onClose();
              else setIndex((n) => n + 1);
            }}
          >
            {pickCopy(locale, last ? UI_COPY.done : UI_COPY.next)}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" data-ke="first-run-skip" className="min-w-0 flex-1" onClick={onClose}>
              {pickCopy(locale, UI_COPY.skip)}
            </Button>
            <Button type="button" variant="ghost" data-ke="first-run-dismiss" className="min-w-0 flex-1" onClick={onClose}>
              {pickCopy(locale, UI_COPY.dismiss)}
            </Button>
          </div>
        </div>
        {last ? (
          <p className="mt-4">
            <CallLink locale={locale} />
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CoachTour({ tourKey, onClose }: { tourKey: TourKey; onClose: () => void }) {
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const steps = TOURS[tourKey];
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const ref = useFocusTrap(true, onClose);
  const step = steps[index] ?? steps[0];
  const last = index >= steps.length - 1;

  useIsoLayout(() => {
    const anchor = document.querySelector(step.anchor);
    const node = anchor instanceof HTMLElement ? anchor : null;
    node?.scrollIntoView({ block: "center", inline: "nearest" });
    if (!node) {
      setBox(null);
      return;
    }
    const rect = node.getBoundingClientRect();
    const width = Math.min(22 * 16, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const below = rect.bottom + 12;
    const top = below + 180 > window.innerHeight ? Math.max(12, rect.top - 180) : below;
    setBox({ top, left, width });
    const previous = node.style.outline;
    const previousOffset = node.style.outlineOffset;
    node.style.outline = "2px solid var(--color-primary)";
    node.style.outlineOffset = "3px";
    return () => {
      node.style.outline = previous;
      node.style.outlineOffset = previousOffset;
    };
  }, [step.anchor, index]);

  return (
    <div className="fixed inset-0 z-[66]" data-ke="coach-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-ke="coach-tour"
        data-tour-key={tourKey}
        data-step={index + 1}
        data-locale={locale}
        className="fixed max-w-[calc(100%-1.5rem)] rounded-xl bg-surface p-4 text-fg shadow-card ring-1 ring-border outline-none"
        style={
          box
            ? { top: box.top, left: box.left, width: box.width }
            : { top: "50%", left: "50%", width: "min(22rem, calc(100% - 1.5rem))", transform: "translate(-50%, -50%)" }
        }
      >
        <p className="text-sm font-medium text-primary">{pickCopy(locale, UI_COPY.tourLabel)}</p>
        <p className="mt-1 text-sm text-muted">{stepCounter(locale, index, steps.length)}</p>
        <h2 id={titleId} className="mt-2 text-lg font-semibold text-balance">
          {pickCopy(locale, step.title)}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-5 text-muted">
          {pickCopy(locale, step.body)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {index > 0 ? (
            <Button type="button" variant="ghost" data-ke="coach-back" onClick={() => setIndex((n) => n - 1)}>
              {pickCopy(locale, UI_COPY.back)}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" data-ke="coach-skip" onClick={onClose}>
            {pickCopy(locale, UI_COPY.skip)}
          </Button>
          <Button
            type="button"
            data-ke="coach-next"
            onClick={() => {
              if (last) onClose();
              else setIndex((n) => n + 1);
            }}
          >
            {pickCopy(locale, last ? UI_COPY.done : UI_COPY.next)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChecklistCard({
  result,
  onHide,
}: {
  result: ChecklistResult;
  onHide: () => void;
}) {
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const provider = result.id === CHECKLIST_PROVIDER;
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
        {result.steps.map((step) => (
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
  const { locale: raw } = useCopy();
  const locale = localeOf(raw);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const [forced, setForced] = useState<OnboardingKey | null>(null);
  const [welcomeClosed, setWelcomeClosed] = useState(false);
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
    setWelcomeClosed(false);
  }, [place.welcome, pathname]);

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

  if (!ready || enabled !== true) return null;

  const replayWelcome = forced === WELCOME_PARENT || forced === WELCOME_PROVIDER ? forced : null;
  const replayTour = forced != null && forced in TOURS ? (forced as TourKey) : null;
  const welcomeKey = replayWelcome ?? place.welcome;
  const showWelcome = replayTour == null && welcomeKey != null && (replayWelcome != null || shouldAutoShow(progress, welcomeKey));
  const tourKey = replayTour ?? place.tour;
  const showTour =
    tourKey != null &&
    !showWelcome &&
    (replayTour != null || (shouldAutoShow(progress, tourKey) && (welcomeClosed || !shouldAutoShow(progress, place.welcome))));

  const checklist =
    place.checklist === CHECKLIST_PROVIDER
      ? providerFacts
      : place.checklist === CHECKLIST_PARENT
        ? parentFacts
        : null;
  const showChecklist =
    checklist != null && (forcedChecklist() === checklist.id || checklistOpen(progress, checklist.id));

  function closeWelcome() {
    if (welcomeKey) rememberSeen(welcomeKey);
    setForced(null);
    setWelcomeClosed(true);
  }
  function closeTour() {
    if (tourKey) rememberSeen(tourKey);
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
