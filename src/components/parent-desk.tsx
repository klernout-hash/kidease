import { Component, lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import type { UpgradeSearch } from "@/components/checkout-return";
import { DeskShell } from "@/components/desk-shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { ParentShortlist } from "@/components/parent-shortlist";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { TaxReceiptStudio } from "@/components/tax-receipt-studio";
import { ChildHealthLog } from "@/components/child-health-log";
import { ChildCareCard } from "@/components/child-care-card";
import { CareReminderForm } from "@/components/care-reminder-form";
import { CoparentDesk } from "@/components/coparent-desk";
import { PortfolioGaps } from "@/components/portfolio-gaps";
import { ChildAgreementFile } from "@/components/parent-agreement-panel";
import { EmptyState } from "@/components/empty-state";
import { FirstRunExample } from "@/components/first-run";
import { KidNotebook } from "@/components/kid-art";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFamily } from "@/lib/server/family";
import { acceptShortlistShare } from "@/lib/server/parent-tracker";
import { dismissUpgradeCard } from "@/lib/server/upgrade-card";
import type { LeadRequest } from "@/lib/lead-requests";
import { parentRequestRows } from "@/lib/parent-request-rows";
import { listTourRequests } from "@/lib/server/tours";
import { listLeadRequests } from "@/lib/server/lead-requests";
import { listParentBills } from "@/lib/server/billing";
import { StripeInvoiceList } from "@/components/stripe-invoice-list";
import { shareChildWithCentres } from "@/lib/server/enrol-queue";
import { parentPayEmptyKey } from "@/lib/copy-keys";
import { useCopy } from "@/lib/use-copy";
import { ageGroupFromMonths, asList, money, monthsBetween } from "@/lib/utils";
import { useSessionDesks } from "@/components/desk-switcher";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import type { Booking, Child, DaycareCard as Card, Payment, TourRequest } from "@/lib/types";
import type { Bill } from "@/lib/bill";
import { billDollars, billIsOpen } from "@/lib/bill";
import { BillStatusBadge, PaymentStateBadge, PaymentStateNote } from "@/components/bill-status";
import { failureReasonText } from "@/lib/payment-state";
import { periodLabel } from "@/lib/stripe-methods";
import { parentMatchScore } from "@/lib/parent-match";
import { parentUrgencyScore, soonestStartDate } from "@/lib/parent-urgency";
import { doorDistanceKm } from "@/lib/card-distance";
import { useAppStore } from "@/lib/store";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";
import { LOADER_SETTLE_MS, withTimeout } from "@/lib/timeout";
import { parentDeskPath, parentNavSearch } from "@/lib/desk-nav";
import { MAX_CHILDREN_PER_PARENT } from "@/lib/children-limit";
import { useStoreShell } from "@/lib/use-native-shell";
import { yieldToMain } from "@/lib/yield-main";
import { canBuyDaycareUpgrade, canBuyParentUpgrade } from "@/lib/upgrade-role";
import { PARENT_UPGRADE_PLANS } from "@/lib/upgrade-plans";
import { ParentHome } from "@/components/parent-home";
import { ParentHomeCare } from "@/components/parent-home-care";
import { ParentAttention } from "@/components/attention-list";
import { useRoleChrome } from "@/components/role-chrome";
import { useParentPlusAccess } from "@/lib/use-parent-plus";
import { DeleteChildControl } from "@/components/delete-child-control";
import { useParentNavigation } from "@/lib/use-parent-navigation";
import { useParentRequestScope } from "@/lib/use-parent-request-scope";
import { childProfileEntryIntent, completedChildProfileSearch, confirmChildProfileDiscard } from "@/lib/child-profile-unsaved";

const ParentPlusPanel = lazy(() =>
  import("@/components/parent-plus").then((m) => ({ default: m.ParentPlusPanel })),
);
const SavedSearchesPanel = lazy(() =>
  import("@/components/saved-searches-panel").then((m) => ({ default: m.SavedSearchesPanel })),
);
const AlertPushSettings = lazy(() =>
  import("@/components/alert-push-settings").then((m) => ({ default: m.AlertPushSettings })),
);
const ChildProfileForm = lazy(() =>
  import("@/components/child-profile-form").then((m) => ({ default: m.ChildProfileForm })),
);
const ParentDeskRails = lazy(() =>
  import("@/components/parent-desk-rails").then((m) => ({ default: m.ParentDeskRails })),
);
const ParentRequestsList = lazy(() =>
  import("@/components/parent-requests").then((m) => ({ default: m.ParentRequestsList })),
);
const DailyCareDesk = lazy(() =>
  import("@/components/daily-care-desk").then((m) => ({ default: m.DailyCareDesk })),
);
const MyWaitlists = lazy(() =>
  import("@/components/my-waitlists").then((m) => ({ default: m.MyWaitlists })),
);

function scheduleIdle(work: () => void): () => void {
  const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
  if (ric) {
    const id = ric(work, { timeout: 400 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, 0);
  return () => window.clearTimeout(id);
}

type ParentTab = "explore" | "saved" | "bookings" | "payments" | "subscription" | "children" | "alerts" | "care" | "waitlists" | "family";

class SavedTabBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <SavedTabFallback />;
    return this.props.children;
  }
}

function SavedTabFallback() {
  const { t } = useCopy();
  return (
    <div className="mt-6 w-full" data-ke="saved-fallback">
      <EmptyState title={t("saved")} body={t("canadaSearchLead")} action={t("emptyFindCare")} actionTo="/search" />
    </div>
  );
}

export function ParentDesk({
  initialTab,
  plusReturn = null,
  upgradeSearch = null,
  billingReturn = false,
  shareToken = null,
  initialSaved = [],
  initialShared = false,
  initialChild = null,
  initialFocus = null,
  familyInvite = null,
}: {
  initialTab?: ParentTab;
  plusReturn?: "success" | "cancel" | null;
  upgradeSearch?: UpgradeSearch | null;
  billingReturn?: boolean;
  shareToken?: string | null;
  initialSaved?: Card[];
  initialShared?: boolean;
  initialChild?: string | null;
  initialFocus?: string | null;
  familyInvite?: string | null;
}) {
  const { user } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const navigate = useNavigate();
  const navigateTab = useCallback((id: string) => {
    void navigate({ to: parentDeskPath(pathname), search: parentNavSearch(id), replace: true });
  }, [navigate, pathname]);
  const { tab, contentTab, selectTab: selectParentTab } = useParentNavigation(initialTab, navigateTab);
  const { issue: issueRequest } = useParentRequestScope(user?.id);
  const storeShell = useStoreShell();
  const chrome = useRoleChrome();
  const plus = useParentPlusAccess();
  const { t, locale } = useCopy();
  const { session: desks, ready: desksReady } = useSessionDesks();
  const hideAdmin = useNativeHidesAdmin();
  const plansOn = !storeShell && desks?.subscriptionsEnabled === true;
  useEffect(() => {
    if (storeShell && contentTab === "subscription") selectParentTab("explore");
  }, [storeShell, contentTab, selectParentTab]);
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const [explore, setExplore] = useState<Card[]>([]);
  const [exploreReady, setExploreReady] = useState(false);
  const [exploreError, setExploreError] = useState(false);
  const [saved, setSaved] = useState<Card[]>(() => asList(initialSaved));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [tours, setTours] = useState<TourRequest[]>([]);
  const [leads, setLeads] = useState<LeadRequest[]>([]);
  const [centreMessages, setCentreMessages] = useState(0);
  const [upgradeDismissed, setUpgradeDismissed] = useState(false);
  const [homeSettled, setHomeSettled] = useState(false);
  const [homeError, setHomeError] = useState(false);
  const [extrasState, setExtrasState] = useState<"pending" | "ready" | "error">("pending");
  const [editing, setEditing] = useState<Child | null | "new">(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [childHealthVersion, setChildHealthVersion] = useState(0);
  const childDirty = useRef(false);
  const childEditorLocation = useRef(locationHref);
  const appliedChildIntent = useRef<string | null>(null);
  const onChildDirtyChange = useCallback((dirty: boolean) => {
    childDirty.current = dirty;
  }, []);
  const confirmChildDiscard = useCallback(() =>
    confirmChildProfileDiscard(childDirty.current, locale === "fr", (message) => window.confirm(message)),
  [locale]);
  const discardChildEdits = useCallback(() => {
    if (!confirmChildDiscard()) return false;
    childDirty.current = false;
    return true;
  }, [confirmChildDiscard]);
  const childBeforeUnload = useCallback(() => childDirty.current, []);
  // A failed/cancelled router transition must leave the current draft guarded.
  const blockChildNavigation = useCallback(() => !confirmChildDiscard(), [confirmChildDiscard]);
  useBlocker({
    shouldBlockFn: blockChildNavigation,
    enableBeforeUnload: childBeforeUnload,
  });
  const [childFocus, setChildFocus] = useState<string | null>(null);
  const [childOpen, setChildOpen] = useState(false);
  const [childrenReady, setChildrenReady] = useState(false);
  const [familyCanWrite, setFamilyCanWrite] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [shareConsent, setShareConsent] = useState(false);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [savedReady, setSavedReady] = useState(false);
  const [shortlistShared, setShortlistShared] = useState(initialShared);
  const acceptedShare = useRef<string | null>(null);

  useEffect(() => {
    if (childEditorLocation.current === locationHref) return;
    childEditorLocation.current = locationHref;
    if (childDirty.current) setEditorVersion((current) => current + 1);
    childDirty.current = false;
    setEditing(null);
  }, [locationHref]);

  function selectTab(id: string) {
    if (id !== tab) {
      if (!discardChildEdits()) return;
      setEditing(null);
    }
    // The hook must also cancel a pending departure from the rendered tab.
    selectParentTab(id);
  }

  function editChild(next: Child | "new") {
    if (!discardChildEdits()) return;
    setEditorVersion((current) => current + 1);
    setEditing(next);
    setChildOpen(true);
  }

  function closeChildEditor(closeDetail = false) {
    if (!discardChildEdits()) return;
    setEditing(null);
    if (closeDetail) setChildOpen(false);
  }

  async function finishChildEdit(childId?: string) {
    childDirty.current = false;
    setEditing(null);
    setChildFocus(childId ?? null);
    setChildOpen(Boolean(childId));
    setChildHealthVersion((current) => current + 1);
    if (initialChild || initialFocus) {
      // Commit the completed entry intent before refreshing authoritative facts.
      await navigate({
        from: parentDeskPath(pathname),
        to: parentDeskPath(pathname),
        search: (current) => completedChildProfileSearch(current),
        replace: true,
      }).catch(() => undefined);
    }
    try {
      await load();
    } catch {
      toast.error(locale === "fr"
        ? "Le changement est enregistré. Rechargez la page pour l’afficher."
        : "Your change is saved. Reload the page to see it.");
    }
  }

  const loadExplore = useCallback(
    async (startBookings: Booking[], fresh = false) => {
      const request = issueRequest("explore");
      const uid = request.viewerId;
      const current = request.isCurrent;
      if (!uid || !current()) return;
      setExploreError(false);
      try {
        if (!(origin.label || "").trim()) {
          startTransition(() => setExplore([]));
          return;
        }
        const loc = origin;
        const data = {
          lat: loc.lat,
          lng: loc.lng,
          radiusKm,
          sort: "match" as const,
          ageGroup: "any" as const,
          label: loc.label,
          q: loc.label,
          startDate: soonestStartDate(startBookings),
        };
        let rows: Card[] = [];
        try {
          rows = await withTimeout(
            dedupedQuery(`parent-search:${uid}:${JSON.stringify(data)}`, QUERY_STALE_MS, () => searchDaycares({ data }), {
              cacheIf: (value) => Array.isArray(value) && value.length > 0,
              fresh,
            }),
            LOADER_SETTLE_MS,
            "parent-search-timeout",
          );
        } catch {
          rows = [];
        }
        if (!current()) return;
        if (!rows.length) {
          try {
            rows = await withTimeout(
              dedupedQuery(
                `parent-featured:${uid}:${loc.lat},${loc.lng},${loc.label ?? ""}`,
                QUERY_STALE_MS,
                () => featuredDaycares({ data: loc }),
                { cacheIf: (value) => Array.isArray(value) && value.length > 0, fresh },
              ),
              LOADER_SETTLE_MS,
              "parent-featured-timeout",
            );
          } catch {
            if (current()) startTransition(() => setExploreError(true));
            return;
          }
        }
        if (current()) startTransition(() => {
          setExplore(asList(rows));
          setExploreError(false);
        });
      } catch {
        if (current()) startTransition(() => setExploreError(true));
      } finally {
        if (current()) startTransition(() => setExploreReady(true));
      }
    },
    [origin, radiusKm, issueRequest],
  );

  const loadFamily = useCallback(async (fresh = false) => {
    const request = issueRequest("family");
    const uid = request.viewerId;
    if (!uid || uid !== user?.id || !request.isCurrent()) return null;
    try {
      if (shareToken && acceptedShare.current !== shareToken) {
        const result = await withTimeout(acceptShortlistShare({ data: { token: shareToken } }), LOADER_SETTLE_MS, "parent-share-timeout").catch(() => null);
        if (!request.isCurrent()) return null;
        acceptedShare.current = shareToken;
        if (result?.ok) toast.success(t("shareShortlistAccepted"));
        else if (result && !result.ok) {
          const key =
            result.reason === "email"
              ? "shareShortlistMismatch"
              : result.reason === "used"
                ? "shareShortlistUsed"
                : result.reason === "self"
                  ? "shareShortlistSelf"
                  : "shareShortlistBad";
          toast.error(t(key));
        }
      }
      if (!request.isCurrent()) return null;
      const f = await withTimeout(dedupedQuery(`parent-family:${uid}`, QUERY_STALE_MS, () => getFamily(), {
        fresh: fresh || Boolean(shareToken),
        cacheIf: (family) => family.viewerId === uid,
      }), LOADER_SETTLE_MS, "parent-family-timeout");
      if (!request.isCurrent()) return null;
      if (f.viewerId !== uid) throw new Error("Family viewer changed");
      await yieldToMain();
      if (!request.isCurrent()) return null;
      startTransition(() => {
        setSaved(asList(f?.saved));
        setBookings(asList(f?.bookings));
        setPayments(asList(f?.payments));
        setChildren(asList(f?.children));
        setChildrenReady(true);
        setFamilyCanWrite(f?.familyCanWrite !== false);
        setCentreMessages(f.centreMessages ?? 0);
        setUpgradeDismissed(Boolean(f.upgradeCardDismissed));
        setShortlistShared(Boolean(f.shortlistShared));
        setHomeSettled(true);
        setHomeError(false);
      });
      return f;
    } catch (error) {
      if (!request.isCurrent()) return null;
      throw error;
    }
  }, [shareToken, t, user?.id, issueRequest]);

  const loadDeskExtras = useCallback(async (fresh = false) => {
    const request = issueRequest("extras");
    const uid = request.viewerId;
    if (!uid || uid !== user?.id || !request.isCurrent()) return;
    setExtrasState("pending");
    const [billed, tourRows, leadRows] = await Promise.allSettled([
      withTimeout(dedupedQuery(`parent-bills:${uid}`, QUERY_STALE_MS, () => listParentBills(), { fresh }), LOADER_SETTLE_MS, "parent-bills-timeout"),
      withTimeout(dedupedQuery(`parent-tours:${uid}`, QUERY_STALE_MS, () => listTourRequests({ data: { desk: "parent" } }), { fresh }), LOADER_SETTLE_MS, "parent-tours-timeout"),
      withTimeout(dedupedQuery(`parent-leads:${uid}`, QUERY_STALE_MS, () => listLeadRequests({ data: { desk: "parent" } }), { fresh }), LOADER_SETTLE_MS, "parent-leads-timeout"),
    ]);
    if (!request.isCurrent()) return;
    startTransition(() => {
      if (billed.status === "fulfilled") setBills(asList(billed.value.bills));
      if (tourRows.status === "fulfilled") setTours(asList(tourRows.value));
      if (leadRows.status === "fulfilled") setLeads(asList(leadRows.value));
      setExtrasState([billed, tourRows, leadRows].every((result) => result.status === "fulfilled") ? "ready" : "error");
    });
  }, [user?.id, issueRequest]);

  function retryHome() {
    const request = issueRequest("retry");
    if (!request.isCurrent()) return;
    setHomeError(false);
    setHomeSettled(false);
    void load().catch(() => { if (request.isCurrent()) setHomeError(true); });
  }

  async function load() {
    const request = issueRequest("home");
    if (!request.isCurrent()) return;
    const f = await loadFamily(true);
    if (!f || !request.isCurrent()) return;
    await Promise.all([loadExplore(f.bookings, true), loadDeskExtras(true)]);
  }

  useEffect(() => {
    setBookings([]);
    setPayments([]);
    setBills([]);
    setChildren([]);
    setChildrenReady(false);
    setTours([]);
    setLeads([]);
    setCentreMessages(0);
    setUpgradeDismissed(false);
    setHomeSettled(false);
    setHomeError(false);
    setExtrasState("pending");
    setExploreError(false);
    setExplore([]);
    setExploreReady(false);
    setPicked({});
    childDirty.current = false;
    appliedChildIntent.current = null;
    setEditing(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void yieldToMain()
      .then(() => {
        if (cancelled) return null;
        return loadFamily(true);
      })
      .then((f) => {
        if (cancelled || !f) return;
        void loadExplore(f.bookings).catch(() => undefined);
        void loadDeskExtras().catch(() => undefined);
      })
      .catch(() => {
        if (cancelled) return;
        startTransition(() => {
          setExploreReady(true);
          setChildrenReady(true);
          setHomeError(true);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadFamily, loadExplore, loadDeskExtras]);

  useEffect(() => {
    if (!initialChild) {
      appliedChildIntent.current = null;
      return;
    }
    const entryIntent = childProfileEntryIntent(locationHref, initialChild, initialFocus);
    if (!entryIntent || !childrenReady || childDirty.current || appliedChildIntent.current === entryIntent) return;
    if (initialChild === "new") {
      appliedChildIntent.current = entryIntent;
      if (children.length >= MAX_CHILDREN_PER_PARENT) {
        setEditing(null);
        return;
      }
      setEditing("new");
      setChildOpen(true);
      return;
    }
    const found = children.find((child) => child.id === initialChild);
    if (!found) return;
    appliedChildIntent.current = entryIntent;
    setChildFocus(found.id);
    setChildOpen(true);
    setEditing(initialFocus ? found : null);
  }, [children, childrenReady, initialChild, initialFocus, locationHref]);

  useEffect(() => {
    if (contentTab !== "saved") {
      setSavedReady(false);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) setSavedReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [contentTab]);

  useEffect(() => {
    function refresh() {
      const request = issueRequest("refresh");
      void loadFamily(true).catch(() => {
        if (request.isCurrent()) setHomeError(true);
      });
    }
    window.addEventListener("kidease-shortlist", refresh);
    return () => window.removeEventListener("kidease-shortlist", refresh);
  }, [loadFamily, issueRequest]);

  const deferredSaved = useDeferredValue(saved);
  const rankedSaved = useMemo(() => {
    if (contentTab !== "saved") return [] as Array<Card & { matchScore: number; urgencyScore: number; distanceKm: number }>;
    try {
      return asList(deferredSaved)
        .flatMap((item) => {
          try {
            const child = asList(children)[0];
            const ageGroup = child?.birthdate ? ageGroupFromMonths(monthsBetween(child.birthdate)) : "any";
            const startDate = soonestStartDate(asList(bookings).filter((b) => b.daycareId === item.id));
            const km = doorDistanceKm(origin, { lat: item.lat, lng: item.lng }) ?? Number.NaN;
            return [
              {
                ...item,
                distanceKm: km,
                matchScore: parentMatchScore({ ...item, distanceKm: km }, { ageGroup, radiusKm, distanceKnown: located }),
                urgencyScore: parentUrgencyScore(item, { ageGroup, startDate }),
              },
            ];
          } catch {
            return [];
          }
        })
        .sort((a, b) => b.urgencyScore - a.urgencyScore || b.matchScore - a.matchScore);
    } catch {
      return [] as Array<Card & { matchScore: number; urgencyScore: number; distanceKm: number }>;
    }
  }, [bookings, children, contentTab, deferredSaved, located, origin, radiusKm]);

  if (!user) return <DeskSkeleton />;
  const upgradeBuyer = {
    role: desks?.role,
    ownsCentre: desks?.ownsCentre,
    linkedToCentre: desks?.centreLinked,
  };
  const onPlusSurface = contentTab === "subscription" || plusReturn != null;
  if (onPlusSurface && desksReady && desks && desks.subscriptionsEnabled !== true) {
    if (canBuyParentUpgrade(upgradeBuyer)) return <Navigate to={parentDeskPath(pathname)} search={{ tab: "explore" }} />;
    if (canBuyDaycareUpgrade(upgradeBuyer)) return <Navigate to="/provider" search={{ desk: "today" }} />;
    if (desks.home === "/admin") return hideAdmin ? <Navigate to={parentDeskPath(pathname)} search={{ tab: "explore" }} /> : <Navigate to="/admin" />;
    if (desks.home === "/support") return <Navigate to="/support" />;
    return <Navigate to={parentDeskPath(pathname)} search={{ tab: "explore" }} />;
  }
  if (onPlusSurface && desksReady && desks && !canBuyParentUpgrade(upgradeBuyer)) {
    if (canBuyDaycareUpgrade(upgradeBuyer)) return <Navigate to="/provider" search={{ desk: "today" }} />;
    if (desks.home === "/admin") return hideAdmin ? <Navigate to={parentDeskPath(pathname)} search={{ tab: "explore" }} /> : <Navigate to="/admin" />;
    if (desks.home === "/support") return <Navigate to="/support" />;
  }
  const showParentPlus = Boolean(desksReady && desks?.subscriptionsEnabled === true && canBuyParentUpgrade(upgradeBuyer));
  const activeChild = children.find((c) => c.id === childFocus) ?? children[0] ?? null;

  return (
    <DeskShell desk="parent" active={tab === "subscription" ? "upgrade" : tab} onSelect={selectTab}>
      <p className="text-muted" data-ke="parent-identity" data-user-id={user.id}>
        {user.displayName ?? user.primaryEmail}
      </p>

      {contentTab === "explore" ? (
        <>
        <ParentHome
          saved={saved}
          bookings={bookings}
          tours={tours}
          leads={leads}
          paid={chrome.paid}
          planLabel={chrome.planLabel}
          renewsOn={chrome.renewsOn}
          messages={centreMessages}
          dismissed={upgradeDismissed}
          settled={homeSettled}
          loadError={homeError}
          extrasState={extrasState}
          bills={bills}
          onRetry={retryHome}
          care={<ParentHomeCare bookings={bookings} userId={user.id} />}
          attention={extrasState === "ready" ? <ParentAttention userId={user.id} tours={tours} bills={bills} childIds={children.map((child) => child.id)} /> : null}
          matches={
            <section data-ke="parent-home-matches" className="min-h-56">
              {!exploreReady ? <p role="status" className="text-sm text-muted">{locale === "fr" ? "Recherche de garderies près de chez vous…" : "Finding care near you…"}</p> : exploreError ? (
                <div role="alert">
                  <p className="text-sm text-muted">{locale === "fr" ? "Les garderies n’ont pas pu être chargées." : "Daycares could not load."}</p>
                  <Button variant="secondary" className="mt-3" onClick={() => { setExploreReady(false); void loadExplore(bookings, true); }}>{locale === "fr" ? "Réessayer" : "Try again"}</Button>
                </div>
              ) : explore.length ? (
                <Suspense fallback={<p role="status">{locale === "fr" ? "Préparation des résultats…" : "Preparing your results…"}</p>}>
                  <ParentDeskRails items={explore} children={children} bookings={bookings} matchOnly />
                </Suspense>
              ) : <EmptyState title={t("parentHomeFindTitle")} body={t("parentHomeFindBody")} />}
            </section>
          }
          onDismiss={() => {
            void dismissUpgradeCard()
              .then(() => setUpgradeDismissed(true))
              .catch(() => setUpgradeDismissed(false));
          }}
        />
        </>
      ) : null}

      {contentTab === "saved" ? (
        <SavedTabBoundary>
        <ParentShortlist
          items={rankedSaved}
          ready={savedReady}
          located={located}
          tours={tours}
          bookings={bookings}
          compareMax={plus.compareMax}
          shared={shortlistShared}
          onTrack={(id, next) => {
            setSaved((cur) =>
              cur.map((item) =>
                item.id === id
                  ? { ...item, trackStatus: next.trackStatus, callNote: next.callNote, tourNote: next.tourNote }
                  : item,
              ),
            );
          }}
          onLeave={() => {
            setShortlistShared(false);
            void loadFamily(true);
          }}
        />
        </SavedTabBoundary>
      ) : null}

      {contentTab === "care" ? (
        <div className="mt-6">
          <Suspense fallback={<div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" />}>
            <DailyCareDesk role="parent" />
          </Suspense>
        </div>
      ) : null}

      {contentTab === "alerts" ? (
        <Suspense fallback={<div className="ke-skel mt-6 h-24 rounded-xl" aria-hidden="true" />}>
          <AlertPushSettings audience="parent" subscriptionsOn={chrome.subscriptionsEnabled === true}>
            <SavedSearchesPanel />
          </AlertPushSettings>
        </Suspense>
      ) : null}

      {contentTab === "family" ? <CoparentDesk inviteToken={familyInvite} /> : null}

      {contentTab === "waitlists" ? (
        <div className="mt-6">
          <h2 className="font-display text-2xl">{t("myWaitlists")}</h2>
          <p className="mt-1 text-sm text-muted">{t("myWaitlistsLead")}</p>
          <Suspense fallback={<div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" />}>
            <MyWaitlists />
          </Suspense>
          <p className="mt-4 text-sm">
            <Link to="/parent/spot-offers" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
              {locale === "fr" ? "Voir les offres de place" : "See spot offers"}
            </Link>
          </p>
        </div>
      ) : null}

      {contentTab === "bookings" ? (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="font-display text-2xl">{t("myRequests")}</h2>
            <p className="mt-1 text-sm text-muted">{t("myRequestsLead")}</p>
            <div className="mt-4">
              <Suspense fallback={<div className="ke-skel h-24 rounded-xl" aria-hidden="true" />}>
                <ParentRequestsList items={parentRequestRows({ leads, tours, bookings })} />
              </Suspense>
            </div>
            {bookings
              .filter((b) => b.status === "accepted" && b.monthlyAmount > 0 && b.paymentStatus !== "paid" && desks?.stripeLive)
              .filter((b) => !bills.some((bill) => bill.bookingId === b.id && billIsOpen(bill.status)))
              .map((b) => (
                <div key={b.id} className="mt-3 max-w-prose rounded-xl border border-border bg-surface p-4">
                  <p className="text-sm font-medium">{b.daycareName}</p>
                  <p className="mt-1 text-sm text-muted">{t("awaitingCentreBill")}</p>
                  <Button size="sm" variant="secondary" className="mt-3 min-h-11" asChild>
                    <Link to={parentDeskPath(pathname)} search={{ tab: "payments" }}>
                      {t("payUseBill")}
                    </Link>
                  </Button>
                </div>
              ))}
          </section>
        </div>
      ) : null}

      {contentTab === "subscription" && !storeShell ? (
        <div className="mt-6 w-full" data-ke="parent-subscription">
          <h2 className="font-display text-2xl">{t(chrome.paid ? "navMyPlan" : "navUpgrade")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("parentPlusLead")}</p>
          {!desksReady ? (
            <div className="ke-skel mt-4 h-32 rounded-xl" aria-hidden="true" />
          ) : showParentPlus ? (
            <div className="mt-4" data-ke="parent-plan-view">
              <p className="ke-native-plan-note mb-3 text-sm text-muted" data-ke="native-plan-note">
                {t("nativePlansHidden")}
              </p>
              <Suspense fallback={<div className="ke-skel h-32 rounded-xl" aria-hidden="true" />}>
                <ParentPlusPanel quiet offerCheckout alwaysOffer plusReturn={plusReturn} upgradeSearch={upgradeSearch} billingReturn={billingReturn} />
              </Suspense>
            </div>
          ) : (
            <CurrentParentPlan />
          )}
        </div>
      ) : null}

      {contentTab === "payments" ? (
        <div className="mt-6 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl" data-tour="parent-payments">{t("payments")}</h2>
              {bills.filter((b) => billIsOpen(b.status)).length ? (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-fg">
                  {t("pay")} · {bills.filter((b) => billIsOpen(b.status)).length}
                </span>
              ) : null}
            </div>
            <div className="mt-4">
              <TaxReceiptStudio />
            </div>
            <LedgerHonesty
              stripeLive={Boolean(desks?.stripeLive)}
              surface="parent"
              plansOn={plansOn}
              className="mt-2"
              ready={desksReady}
            />
            <div className="mt-6">
              <StripeInvoiceList audience="parent" />
            </div>
          </div>
          <div>
            <h3 className="font-display text-xl">{t("openBills")}</h3>
            {extrasState === "pending" ? (
              <p className="mt-3 text-sm text-muted" role="status">{t("loading")}</p>
            ) : bills.filter((b) => billIsOpen(b.status)).length ? (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                {bills
                  .filter((b) => billIsOpen(b.status))
                  .map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{b.daycareName}</p>
                          <BillStatusBadge status={b.status} />
                          <PaymentStateBadge state={b.paymentState} />
                        </div>
                        <p className="text-sm text-muted">
                          {b.childName ? `${b.childName} · ` : ""}
                          {periodLabel(b.period, locale)}
                          {b.dueAt ? ` · ${t("billDue")} ${b.dueAt}` : ""}
                        </p>
                        <PaymentStateNote
                          state={b.paymentState}
                          reason={failureReasonText(b.lastErrorCode, locale === "fr" ? "fr" : "en")}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-xl tabular-nums">{money(billDollars(b), locale)}</span>
                        {b.paymentState === "processing" ? null : (
                          <Button size="sm" asChild>
                            <Link to="/pay/bill/$billId" params={{ billId: b.id }} search={{}} data-ke="native-checkout">
                              {b.paymentState === "requires_action"
                                ? t("billConfirmPayment")
                                : b.paymentState === "failed"
                                  ? t("billPayAgain")
                                  : t("pay")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">{t("noPayments")}</p>
            )}
          </div>
          <div>
            <h3 className="font-display text-xl">{t("paidBills")}</h3>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
              {extrasState !== "ready" ? (
                <li className="p-4 text-sm text-muted" role="status">{t("loading")}</li>
              ) : bills.filter((b) => b.status === "paid" || b.status === "refunded").length === 0 &&
              payments.length === 0 &&
              bills.filter((b) => billIsOpen(b.status)).length === 0 ? (
                <li className="p-2">
                  <EmptyState title={t("noPayments")} body={t(parentPayEmptyKey(plansOn))} action={t("emptyFindCare")} actionTo="/search" extra={<FirstRunExample id="parent-payments" />} />
                </li>
              ) : (
                <>
                  {bills
                    .filter((b) => b.status === "paid" || b.status === "refunded")
                    .map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{b.daycareName}</p>
                            <BillStatusBadge status={b.status} />
                          </div>
                          <p className="text-muted">
                            {periodLabel(b.period, locale)} · {b.number}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums">{money(billDollars(b), locale)}</span>
                          {b.receiptUrl ? (
                            <Button size="sm" variant="secondary" asChild>
                              <a href={b.receiptUrl} target="_blank" rel="noreferrer">
                                {t("viewReceipt")}
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" asChild>
                              <Link to="/pay/bill/$billId" params={{ billId: b.id }} search={{}} data-ke="native-checkout">
                                {t("viewReceipt")}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  {payments
                    .filter((p) => !bills.some((b) => b.id === p.invoiceId || b.number === p.reference))
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between p-4 text-sm">
                        <div>
                          <p className="font-medium">{p.daycareName}</p>
                          <p className="text-muted">
                            {p.method} · {p.status === "paid" ? t("paid") : t("pending")}
                          </p>
                        </div>
                        <span className="tabular-nums">{money(p.amount, locale)}</span>
                      </li>
                    ))}
                </>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {contentTab === "children" ? (
        <div className="mt-6 space-y-4">
          <ChildHealthLog key={`${user.id}:${childHealthVersion}`} />
          <PortfolioGaps children={children} />
          <div>
            <h2 className="font-display text-2xl">{t("childProfileTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              <span className="ke-site-compact">{t("childProfileLead")}</span>
              <span className="ke-site-desktop">{t("childProfileSendLead")}</span>
            </p>
          </div>
          {familyCanWrite ? null : (
            <p className="rounded-xl bg-surface p-4 text-sm ring-1 ring-border" role="status">
              {locale === "fr"
                ? "Vous pouvez regarder. Vous ne pouvez pas modifier cette famille."
                : "You can look. You cannot change this family."}
            </p>
          )}
          {!childrenReady ? (
            <p className="text-sm text-muted" role="status">{t("loading")}</p>
          ) : children.length === 0 && !editing ? (
            <EmptyState
              title={t("noChildren")}
              body={familyCanWrite ? t("noChildrenLead") : locale === "fr" ? "Le parent principal n’a pas encore ajouté d’enfant." : "The main parent has not added a child yet."}
              action={familyCanWrite ? t("emptyAddChild") : undefined}
              onAction={familyCanWrite ? () => editChild("new") : undefined}
            />
          ) : (
          <div className="ke-split" data-ke="children-split" data-selected={childOpen || editing ? "true" : "false"}>
            <div className="ke-split-list min-w-0">
              <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
                {children.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={activeChild?.id === c.id}
                      className="flex min-h-11 w-full items-center px-4 text-left font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      onClick={() => {
                        if (!discardChildEdits()) return;
                        setChildFocus(c.id);
                        setChildOpen(true);
                        setEditing(null);
                      }}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
              {familyCanWrite && children.length < MAX_CHILDREN_PER_PARENT ? (
                <Button className="mt-3" onClick={() => editChild("new")}>
                  {children.length ? t("newChild") : t("addChild")}
                </Button>
              ) : null}
            </div>
            <div className="ke-split-detail min-w-0" data-ke="children-detail">
              <Button variant="ghost" className="mb-3 md:hidden" onClick={() => closeChildEditor(true)}>
                {t("back")}
              </Button>
              {editing ? (
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <h2 className="mb-4 text-base font-semibold">{editing === "new" ? t("newChild") : t("profileEdit")}</h2>
              <Suspense fallback={<div className="ke-skel h-48 rounded-xl" aria-hidden="true" />}>
                <ChildProfileForm
                  key={`${editing === "new" ? "new" : editing.id}:${editorVersion}`}
                  initial={editing === "new" ? null : editing}
                  focus={initialFocus}
                  onDirtyChange={onChildDirtyChange}
                  onSaved={(childId) => { void finishChildEdit(childId); }}
                  onCancel={() => closeChildEditor()}
                />
              </Suspense>
            </div>
              ) : (
            <>
              <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
                  {children.map((c) => {
                    const selected = picked[c.id] ?? [];
                    return (
                    <li key={c.id} className={c.id === activeChild?.id ? "ph-no-capture" : "ke-child-rest ph-no-capture"}>
                      <ChildCareCard
                        child={c}
                        actions={familyCanWrite ? (
                          <button
                            type="button"
                            data-ke="child-profile-edit"
                            onClick={() => editChild(c)}
                            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {t("profileEdit")}
                          </button>
                        ) : undefined}
                      />
                      {c.id === activeChild?.id ? <ChildAgreementFile childId={c.id} /> : null}
                      {c.id === activeChild?.id ? <CareReminderForm childId={c.id} childName={c.name} /> : null}
                      {familyCanWrite ? (
                      <>
                      <div className="px-3 pb-3">
                        <DeleteChildControl
                          child={{ id: c.id, name: c.name }}
                          onDeleted={() => { void finishChildEdit(); }}
                        />
                      </div>
                      <div className="mt-4 rounded-lg bg-bg p-3 ring-1 ring-border">
                        <p className="text-sm font-medium">{t("sendChildProfile")}</p>
                        {saved.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            {t("sendChildNeedSaved")}
                            <Link to="/search" className="ml-1 underline">
                              {t("wayfindFindCare")}
                            </Link>
                          </p>
                        ) : (
                          <>
                            <ul className="mt-2 space-y-1.5">
                              {saved.map((d) => {
                                const on = selected.includes(d.id);
                                return (
                                  <li key={d.id}>
                                    <label data-ke="child-share-centre" className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm touch-manipulation">
                                      <input
                                        type="checkbox"
                                        className="size-4 accent-primary"
                                        checked={on}
                                        onChange={() => {
                                          void yieldToMain().then(() => {
                                            startTransition(() => {
                                              setPicked((cur) => {
                                                const next = new Set(cur[c.id] ?? []);
                                                if (on) next.delete(d.id);
                                                else next.add(d.id);
                                                return { ...cur, [c.id]: [...next] };
                                              });
                                            });
                                          });
                                        }}
                                      />
                                      <span>{d.name}</span>
                                      <span className="text-subtle">{d.city}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                            <label className="mt-3 flex min-h-11 items-start gap-3 text-sm">
                              <input
                                type="checkbox"
                                className="mt-1 size-5"
                                checked={shareConsent}
                                onChange={(event) => setShareConsent(event.target.checked)}
                              />
                              <span>
                                {locale === "fr"
                                  ? "Je consens à partager ce profil seulement avec les centres que je coche."
                                  : "I agree to share this profile only with the centres I pick."}
                              </span>
                            </label>
                            <Button
                              className="mt-3"
                              size="sm"
                              disabled={!selected.length || !shareConsent || sendingId === c.id}
                              onClick={() => {
                                setSendingId(c.id);
                                void shareChildWithCentres({ data: { childId: c.id, daycareIds: selected, consent: true } })
                                  .then((res) => {
                                    confirmSuccess({
                                      variant: "toast",
                                      title: t("sentChildTo")
                                        .replace("{name}", res.childName)
                                        .replace("{n}", String(res.sent.length)),
                                    });
                                    selectTab("bookings");
                                    return load();
                                  })
                                  .catch((err) => toast.error(err instanceof Error ? err.message : t("sendFailed")))
                                  .finally(() => setSendingId(null));
                              }}
                            >
                              {sendingId === c.id ? t("sendChildSending") : t("sendChildCta")}
                            </Button>
                          </>
                        )}
                      </div>
                      </>
                      ) : null}
                    </li>
                    );
                  })}
              </ul>
            </>
              )}
            </div>
          </div>
          )}
        </div>
      ) : null}
    </DeskShell>
  );
}

function CurrentParentPlan() {
  const { t, locale } = useCopy();
  const plan = PARENT_UPGRADE_PLANS.find((row) => row.id === "free") ?? PARENT_UPGRADE_PLANS[0];
  const lang = locale === "fr" ? "fr" : "en";
  return (
    <section className="mt-4 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="parent-plan-view">
      <h3 className="font-display text-xl">{plan?.name[lang]}</h3>
      <p className="mt-1 text-sm font-medium text-fg">{lang === "fr" ? "Sans frais" : "No charge"}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        {plan?.benefits.map((row) => (
          <li key={row.en}>{row[lang]}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">{t("plansNotOffered")}</p>
    </section>
  );
}
