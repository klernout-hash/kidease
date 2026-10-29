import { Component, lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import type { UpgradeSearch } from "@/components/checkout-return";
import { DeskShell } from "@/components/desk-shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { ParentShortlist } from "@/components/parent-shortlist";
import { StatusBadge } from "@/components/status-badge";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { TaxReceiptStudio } from "@/components/tax-receipt-studio";
import { ChildCareCard } from "@/components/child-care-card";
import { EmptyState } from "@/components/empty-state";
import { KidNotebook } from "@/components/kid-art";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFamily } from "@/lib/server/family";
import { acceptShortlistShare } from "@/lib/server/parent-tracker";
import { dismissUpgradeCard } from "@/lib/server/upgrade-card";
import { listTourRequests } from "@/lib/server/tours";
import { listLeadRequests } from "@/lib/server/lead-requests";
import type { LeadRequest } from "@/lib/lead-requests";
import { listParentBills } from "@/lib/server/billing";
import { shareChildWithCentres } from "@/lib/server/enrol-queue";
import { parentPayEmptyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { ageGroupFromMonths, asList, formatMonth, money, monthsBetween } from "@/lib/utils";
import { useSessionDesks } from "@/components/desk-switcher";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import type { Booking, Child, DaycareCard as Card, Payment, TourRequest } from "@/lib/types";
import type { Bill } from "@/lib/bill";
import { billDollars, billIsOpen } from "@/lib/bill";
import { BillStatusBadge } from "@/components/bill-status";
import { periodLabel } from "@/lib/stripe-methods";
import { parentMatchScore } from "@/lib/parent-match";
import { parentUrgencyScore, soonestStartDate } from "@/lib/parent-urgency";
import { doorDistanceKm } from "@/lib/card-distance";
import { useAppStore } from "@/lib/store";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { inboxThreadTo, parentDeskPath, parentNavSearch } from "@/lib/desk-nav";
import { MAX_CHILDREN_PER_PARENT } from "@/lib/children-limit";
import { parentDeskTabOrDefault } from "@/lib/parent-tab";
import { useStoreShell } from "@/lib/use-native-shell";
import { yieldToMain } from "@/lib/yield-main";
import { canBuyDaycareUpgrade, canBuyParentUpgrade } from "@/lib/upgrade-role";
import { PARENT_UPGRADE_PLANS } from "@/lib/upgrade-plans";
import { ParentHome } from "@/components/parent-home";
import { useRoleChrome } from "@/components/role-chrome";
import { useParentPlusAccess } from "@/lib/use-parent-plus";
import { DeleteChildControl } from "@/components/delete-child-control";

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
const TourCard = lazy(() =>
  import("@/components/tour-card").then((m) => ({ default: m.TourCard })),
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

type ParentTab = "explore" | "saved" | "bookings" | "payments" | "subscription" | "children" | "alerts" | "care" | "waitlists";

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
}: {
  initialTab?: ParentTab;
  plusReturn?: "success" | "cancel" | null;
  upgradeSearch?: UpgradeSearch | null;
  billingReturn?: boolean;
  shareToken?: string | null;
  initialSaved?: Card[];
  initialShared?: boolean;
  initialChild?: string | null;
}) {
  const { user } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlTab = useRouterState({
    select: (s) => {
      const tab = (s.location.search as { tab?: unknown }).tab;
      return typeof tab === "string" ? tab : "";
    },
  });
  const navigate = useNavigate();
  const storeShell = useStoreShell();
  const chrome = useRoleChrome();
  const plus = useParentPlusAccess();
  const { t, locale } = useCopy();
  const { session: desks, ready: desksReady } = useSessionDesks();
  const hideAdmin = useNativeHidesAdmin();
  const plansOn = !storeShell && desks?.subscriptionsEnabled === true;
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const [tab, setTab] = useState<ParentTab>(initialTab ?? "explore");
  const [contentTab, setContentTab] = useState<ParentTab>(initialTab ?? "explore");
  const [explore, setExplore] = useState<Card[]>([]);
  const [exploreReady, setExploreReady] = useState(false);
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
  const [editing, setEditing] = useState<Child | null | "new">(null);
  const [childFocus, setChildFocus] = useState<string | null>(null);
  const [childOpen, setChildOpen] = useState(false);
  const [childrenReady, setChildrenReady] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [shareConsent, setShareConsent] = useState(false);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [savedReady, setSavedReady] = useState(false);
  const [shortlistShared, setShortlistShared] = useState(initialShared);
  const acceptedShare = useRef<string | null>(null);

  const selectTab = useCallback((id: string) => {
    const next = parentDeskTabOrDefault(id);
    setTab(next);
    const search = parentNavSearch(id);
    const target = search.tab ?? "";
    if (target && target !== urlTab) {
      void navigate({ to: parentDeskPath(pathname), search, replace: true });
    }
    void yieldToMain().then(() => {
      startTransition(() => setContentTab(next));
    });
  }, [navigate, pathname, urlTab]);

  const loadExplore = useCallback(
    async (startBookings: Booking[], fresh = false) => {
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
        const rows = await withTimeoutFallback(
          dedupedQuery(`parent-search:${JSON.stringify(data)}`, QUERY_STALE_MS, () => searchDaycares({ data }), {
            cacheIf: (value) => Array.isArray(value) && value.length > 0,
            fresh,
          }),
          LOADER_SETTLE_MS,
          [] as Card[],
        );
        const next = rows.length
          ? rows
          : await withTimeoutFallback(
              dedupedQuery(
                `parent-featured:${loc.lat},${loc.lng},${loc.label ?? ""}`,
                QUERY_STALE_MS,
                () => featuredDaycares({ data: loc }),
                { cacheIf: (value) => Array.isArray(value) && value.length > 0, fresh },
              ),
              LOADER_SETTLE_MS,
              [] as Card[],
            );
        startTransition(() => setExplore(asList(next)));
      } finally {
        startTransition(() => setExploreReady(true));
      }
    },
    [origin, radiusKm],
  );

  const loadFamily = useCallback(async (fresh = false) => {
    if (shareToken && acceptedShare.current !== shareToken) {
      const result = await acceptShortlistShare({ data: { token: shareToken } }).catch(() => null);
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
    const f = await dedupedQuery(`parent-family:${user?.id ?? ""}`, QUERY_STALE_MS, () => getFamily(), {
      fresh: fresh || Boolean(shareToken),
    });
    await yieldToMain();
    startTransition(() => {
      setSaved(asList(f?.saved));
      setBookings(asList(f?.bookings));
      setPayments(asList(f?.payments));
      setChildren(asList(f?.children));
      setChildrenReady(true);
      setCentreMessages(f.centreMessages ?? 0);
      setUpgradeDismissed(Boolean(f.upgradeCardDismissed));
      setShortlistShared(Boolean(f.shortlistShared));
    });
    return f;
  }, [shareToken, t, user?.id]);

  const loadDeskExtras = useCallback(async (fresh = false) => {
    const uid = user?.id ?? "";
    const [billed, tourRows, leadRows] = await Promise.all([
      dedupedQuery(
        `parent-bills:${uid}`,
        QUERY_STALE_MS,
        () => listParentBills().catch(() => ({ bills: [] as Bill[] })),
        { fresh },
      ),
      dedupedQuery(
        `parent-tours:${uid}`,
        QUERY_STALE_MS,
        () => listTourRequests({ data: { desk: "parent" } }).catch(() => [] as TourRequest[]),
        { fresh },
      ),
      dedupedQuery(
        `parent-leads:${uid}`,
        QUERY_STALE_MS,
        () => listLeadRequests({ data: { desk: "parent" } }).catch(() => [] as LeadRequest[]),
        { fresh },
      ),
    ]);
    startTransition(() => {
      setBills(asList(billed?.bills));
      setTours(asList(tourRows));
      setLeads(asList(leadRows));
    });
  }, [user?.id]);

  async function load() {
    const f = await loadFamily(true);
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
    setExplore([]);
    setExploreReady(false);
    setPicked({});
    setEditing(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;
    void yieldToMain()
      .then(() => {
        if (cancelled) return null;
        return loadFamily();
      })
      .then((f) => {
        if (cancelled || !f) return;
        startTransition(() => setHomeSettled(true));
        cancelIdle = scheduleIdle(() => {
          if (cancelled) return;
          void loadExplore(f.bookings).catch(() => undefined);
          void loadDeskExtras().catch(() => undefined);
        });
      })
      .catch(() => {
        startTransition(() => {
          setExploreReady(true);
          setChildrenReady(true);
        });
      });
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [user?.id, loadFamily, loadExplore, loadDeskExtras]);

  useEffect(() => {
    if (!initialChild || !childrenReady) return;
    if (initialChild === "new") {
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
    setChildFocus(found.id);
    setChildOpen(true);
    setEditing(null);
  }, [children, childrenReady, initialChild]);

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
    if (!initialTab) return;
    setTab(initialTab);
    startTransition(() => setContentTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    function refresh() {
      void loadFamily(true).catch(() => undefined);
    }
    window.addEventListener("kidease-shortlist", refresh);
    return () => window.removeEventListener("kidease-shortlist", refresh);
  }, [loadFamily]);

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

  void explore;
  void exploreReady;
  void ParentDeskRails;
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
    if (canBuyDaycareUpgrade(upgradeBuyer) && desks.subscriptionsEnabled) return <Navigate to="/provider/subscription" />;
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
          onDismiss={() => {
            void dismissUpgradeCard()
              .then(() => setUpgradeDismissed(true))
              .catch(() => setUpgradeDismissed(false));
          }}
        />
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
            {leads.length === 0 && bookings.length === 0 ? (
              <EmptyState title={t("noRequests")} body={t("noRequestsLead")} action={t("emptyFindCare")} actionTo="/search" art={<KidNotebook />} />
            ) : leads.length ? (
            <Suspense fallback={<div className="ke-skel h-24 rounded-xl" aria-hidden="true" />}>
              <ParentRequestsList items={leads} />
            </Suspense>
            ) : null}
          </div>
        </section>
        {tours.length ? (
          <section>
            <h2 className="font-display text-2xl">{t("pendingTours")}</h2>
            <ul className="mt-4 space-y-3">
              {tours.map((tour) => (
                <li key={tour.id}>
                  <Suspense fallback={<div className="ke-skel h-24 rounded-xl" aria-hidden="true" />}>
                    <TourCard tour={tour} />
                  </Suspense>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {bookings.length === 0 ? null : (
        <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/daycare/$slug" params={{ slug: b.daycareSlug }} className="font-medium hover:underline">
                      {b.daycareName}
                    </Link>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm text-muted">
                    {b.childName ? `${b.childName} · ` : ""}
                    {b.startDate ?? formatMonth(b.startMonth, locale)} · {t(b.ageGroup)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {b.conversationId ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to={inboxThreadTo(pathname)} params={{ id: b.conversationId }}>
                        {t("openChat")}
                      </Link>
                    </Button>
                  ) : null}
                  {(() => {
                    const openBill = bills.find((bill) => bill.bookingId === b.id && billIsOpen(bill.status));
                    if (openBill) {
                      return (
                        <Button size="sm" asChild>
                          <Link to="/pay/bill/$billId" params={{ billId: openBill.id }} search={{}} data-ke="native-checkout">
                            {t("pay")}
                          </Link>
                        </Button>
                      );
                    }
                    if (b.status === "accepted" && b.paymentStatus !== "paid" && desks?.stripeLive) {
                      return (
                        <div className="max-w-[14rem] text-right">
                          <p className="text-xs text-muted">{t("awaitingCentreBill")}</p>
                          <Button size="sm" variant="secondary" className="mt-2" asChild>
                            <Link to={parentDeskPath(pathname)} search={{ tab: "payments" }}>
                              {t("payUseBill")}
                            </Link>
                          </Button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </li>
            ))
          }
        </ul>
        )}
        </div>
      ) : null}

      {contentTab === "subscription" ? (
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
              <h2 className="font-display text-2xl">{t("payments")}</h2>
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
          </div>
          <div>
            <h3 className="font-display text-xl">{t("openBills")}</h3>
            {bills.filter((b) => billIsOpen(b.status)).length ? (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                {bills
                  .filter((b) => billIsOpen(b.status))
                  .map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{b.daycareName}</p>
                          <BillStatusBadge status={b.status} />
                        </div>
                        <p className="text-sm text-muted">
                          {b.childName ? `${b.childName} · ` : ""}
                          {periodLabel(b.period, locale)}
                          {b.dueAt ? ` · ${t("billDue")} ${b.dueAt}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-xl tabular-nums">{money(billDollars(b), locale)}</span>
                        <Button size="sm" asChild>
                          <Link to="/pay/bill/$billId" params={{ billId: b.id }} search={{}} data-ke="native-checkout">
                            {t("pay")}
                          </Link>
                        </Button>
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
              {bills.filter((b) => b.status === "paid" || b.status === "refunded").length === 0 &&
              payments.length === 0 &&
              bills.filter((b) => billIsOpen(b.status)).length === 0 ? (
                <li className="p-2">
                  <EmptyState title={t("noPayments")} body={t(parentPayEmptyKey(plansOn))} action={t("emptyFindCare")} actionTo="/search" />
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
          <div>
            <h2 className="font-display text-2xl">{t("childProfileTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              <span className="ke-site-compact">{t("childProfileLead")}</span>
              <span className="ke-site-desktop">{t("childProfileSendLead")}</span>
            </p>
          </div>
          {children.length === 0 && !editing ? (
            <EmptyState title={t("noChildren")} body={t("noChildrenLead")} action={t("emptyAddChild")} onAction={() => { setEditing("new"); setChildOpen(true); }} />
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
              {children.length < MAX_CHILDREN_PER_PARENT ? (
                <Button className="mt-3" onClick={() => { setEditing("new"); setChildOpen(true); }}>
                  {children.length ? t("newChild") : t("addChild")}
                </Button>
              ) : null}
            </div>
            <div className="ke-split-detail min-w-0" data-ke="children-detail">
              <Button variant="ghost" className="mb-3 md:hidden" onClick={() => { setChildOpen(false); setEditing(null); }}>
                {t("back")}
              </Button>
              {editing ? (
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <h2 className="mb-4 text-base font-semibold">{editing === "new" ? t("newChild") : t("profileEdit")}</h2>
              <Suspense fallback={<div className="ke-skel h-48 rounded-xl" aria-hidden="true" />}>
                <ChildProfileForm
                  initial={editing === "new" ? null : editing}
                  onSaved={() => {
                    setEditing(null);
                    void load();
                  }}
                  onCancel={() => setEditing(null)}
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
                        actions={
                          <button
                            type="button"
                            data-ke="child-profile-edit"
                            onClick={() => setEditing(c)}
                            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {t("profileEdit")}
                          </button>
                        }
                      />
                      <div className="px-3 pb-3">
                        <DeleteChildControl
                          child={{ id: c.id, name: c.name }}
                          onDeleted={() => {
                            setEditing(null);
                            void load();
                          }}
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
                                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
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
