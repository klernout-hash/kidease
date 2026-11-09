import { createFileRoute, Link, Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { canUseOperatorTools } from "@/lib/operator-tools";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { BlockFamilyButton } from "@/components/block-user";
import { StatusBadge } from "@/components/status-badge";
import { PriorityPill } from "@/components/priority-pill";
import { TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useLocallySignedOut, useSettledUser } from "@/lib/auth/use-current-user";
import { createListing, getProvider } from "@/lib/server/family";
import { dismissUpgradeCard } from "@/lib/server/upgrade-card";
import {
  DUPLICATE_LISTING_MESSAGE,
  duplicateListingUserMessage,
  isDaycareAlreadyListedMessage,
  listingCreateErrorMessage,
} from "@/lib/listing-identity";
import { CentreRequestGuard } from "@/components/centre-request-guard";
import { decideParentRequest, listDaycareIncoming } from "@/lib/server/enrol-queue";
import { listTourRequests } from "@/lib/server/tours";
import { listLeadRequests } from "@/lib/server/lead-requests";
import { DaycareLeadInbox } from "@/components/daycare-lead-inbox";
import { CentreFamilyDocs } from "@/components/family-vault";
import { EmptyState } from "@/components/empty-state";
import { TodayUrgencyHome } from "@/components/today-urgency-home";
import { type DaycareDesk } from "@/lib/desk-nav";
import { capturePostHogEvent } from "@/lib/posthog";
import type { LeadRequest } from "@/lib/lead-requests";
import { listCentrePipeline } from "@/lib/server/crm-pipeline";
import { CentrePipeline } from "@/components/centre-pipeline";
import type { PipelineCard } from "@/lib/crm-pipeline";
import { TourCard } from "@/components/tour-card";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { storedCentreName } from "@/lib/utils";
import { FOUNDING_PAGE, foundingLocale } from "@/lib/founding-period";
import { formatAgeLabel, formatStart, scheduleLabel } from "@/lib/templates";
import type { Child, Daycare, SpotRequest, TourRequest } from "@/lib/types";
import { ProviderContractsPanel } from "@/components/provider-contracts";
import { AgreementRequestAction, CentreAgreementEditor } from "@/components/parent-agreement-panel";
import { useCentreAgreementChips } from "@/components/use-centre-agreement-chips";
import { ListingCultureFields } from "@/components/listing-culture-fields";
import { CapacityForm, Field } from "@/components/provider-listing-forms";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import {
  downgradeListingPhotoFile,
  LISTING_PHOTO_ACCEPT,
  listingPhotoByteBudget,
  ListingPhotoPrepareError,
} from "@/lib/listing-photo-downgrade";
import { listingPublishMissing, mergeListingDraft } from "@/lib/listing-publish";
import { TourAvailabilityDesk } from "@/components/tour-availability-desk";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { TrustSignals } from "@/components/trust-badge";
import { ProviderTrustChecklist } from "@/components/provider-trust";
import { listingStatusFromClaim } from "@/lib/listing-status";
import { publicApprovalEligible } from "@/lib/approve-live";
import { KidEaseApprovalStrip } from "@/components/kidease-approval";
import { officialLicenceNumber } from "@/lib/licensing";
import { ProviderMoneyPanel } from "@/components/provider-money";
import { QboPanel } from "@/components/qbo-panel";
import { CwelccPanel } from "@/components/cwelcc-panel";
import { TaxReceiptStudio } from "@/components/tax-receipt-studio";
import { TourCalendarPage } from "@/components/tour-calendar-page";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { VacancyConfirmLoop } from "@/components/vacancy-confirm";
import { SpotOfferDesk } from "@/components/spot-offer-desk";
import { DirectorNudgeQueue } from "@/components/director-nudges";
import { FreePageExplainer } from "@/components/free-listing-share";
import { CompletenessChecklist } from "@/components/listing-completeness";
import { ClaimProgressMeter } from "@/components/claim-progress-meter";
import { ActionRequiredBanner, ListingReadinessCoach } from "@/components/listing-readiness-coach";
import { COACH_FOCUS_ANCHOR, type ListingCoachFocus } from "@/lib/listing-verified";
import { DemandCues } from "@/components/rank-cues";
import type { DemandSnapshot } from "@/lib/demand-heat";
import type { ProviderEntitlements } from "@/lib/provider-entitlements";
import { CentreEmployeesPanel } from "@/components/centre-employees";
import { StaffSchedulingDesk } from "@/components/staff-scheduling-desk";
import { StaffTimesheetDesk } from "@/components/staff-timesheet-desk";
import { CentreToolsDesk } from "@/components/centre-tools-desk";
import { LearningStoriesDesk, StoriesDeskLink } from "@/components/learning-stories-desk";
import { CurriculumDeskLink, CurriculumPackDesk } from "@/components/curriculum-pack";
import { OrgDeskLink, OrgOccupancyDesk } from "@/components/org-occupancy-desk";
import { EceJobDesk } from "@/components/ece-job-desk";
import { AgeOpenSpotsDesk } from "@/components/age-open-spots-desk";
import { ChildCheckinDesk } from "@/components/child-checkin-desk";
import { SafeArrivalPanel } from "@/components/safe-arrival-panel";
import { ChildHealthLog } from "@/components/child-health-log";
import { orgDeskStatus } from "@/lib/server/org-occupancy";
import { gapCopy, pickCentre } from "@/lib/gap-features";
import { ProviderScreeningPanel } from "@/components/provider-screening";
import { useSessionDesks } from "@/components/desk-switcher";
import { useRoleChrome } from "@/components/role-chrome";
import { DaycareDeskHome } from "@/components/daycare-desk-home";
import { HostCalendarDesk } from "@/components/host-calendar-desk";
import { HostListingsDesk } from "@/components/host-listing-desk";
import { HostTodayHome } from "@/components/host-today-home";
import { hostSectionFromFocus } from "@/lib/host-action";
import { isHostSection } from "@/lib/host-listing";
import { syncHostActionNotices } from "@/lib/server/host-action";
import { ProviderInsightsDesk } from "@/components/provider-insights-desk";
import { TopRatedDesk } from "@/components/top-rated-desk";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";

const DESKS: DaycareDesk[] = ["today", "requests", "money", "listings", "insights", "top-rated", "tours", "calendar", "licence", "contract", "promote", "employees", "screening", "staff", "stories", "sites", "learning", "hours", "tools"];
const OWNER_DESKS = new Set<DaycareDesk>(["money", "licence", "contract", "promote"]);
const DEFAULT_DESK: DaycareDesk = "today";
const COACH_FOCUS = new Set<ListingCoachFocus>([
  "license",
  "province",
  "hours",
  "ages",
  "capacity",
  "fees",
  "photo",
  "screening",
  "subsidy",
  "policies",
  "vacancy",
]);

export function providerBeforeLoad({
  context,
  location,
}: {
  context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
  location: Parameters<typeof privateReturnPath>[0];
}) {
  return beforeLoadPrivate(privateReturnPath(location), context.roleChrome);
}

export function providerHead() {
  return {
    meta: [
      { title: "Daycare desk · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export function providerValidateSearch(s: Record<string, unknown>) {
    const out: {
      desk?: DaycareDesk;
      preview?: "support";
      claimed?: boolean;
      focus?: ListingCoachFocus;
      centre?: string;
      section?: string;
      qboCode?: string;
      qboState?: string;
      realmId?: string;
    } = {};
    const deskRaw = typeof s.desk === "string" ? s.desk : "";
    const desk = deskRaw === "overview" ? "today" : deskRaw;
    if (DESKS.includes(desk as DaycareDesk)) out.desk = desk as DaycareDesk;
    if (s.preview === "support") out.preview = "support";
    if (s.claimed === true || s.claimed === "1" || s.claimed === "true") out.claimed = true;
    const focus = typeof s.focus === "string" ? s.focus : "";
    if (COACH_FOCUS.has(focus as ListingCoachFocus)) out.focus = focus as ListingCoachFocus;
    if (typeof s.centre === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(s.centre)) out.centre = s.centre;
    if (typeof s.section === "string" && isHostSection(s.section)) out.section = s.section;
    if (typeof s.code === "string" && s.code.length > 0 && s.code.length <= 512) out.qboCode = s.code;
    if (typeof s.state === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(s.state)) out.qboState = s.state;
    if (typeof s.realmId === "string" && /^[0-9]{1,32}$/.test(s.realmId)) out.realmId = s.realmId;
    if (out.qboCode && out.qboState && out.realmId) out.desk = "money";
  return out;
}

export const Route = createFileRoute("/provider")({
  beforeLoad: providerBeforeLoad,
  head: providerHead,
  pendingComponent: ProviderPending,
  validateSearch: providerValidateSearch,
  component: ProviderPage,
});

function ProviderPending() {
  const { t } = useCopy();
  return (
    <Shell>
      <div role="status" aria-live="polite" aria-label={t("loading")}>
        <DeskSkeleton />
      </div>
    </Shell>
  );
}

export function ProviderPage() {
  const { user, isPending } = useSettledUser();
  const locallyOut = useLocallySignedOut();
  const chrome = useRoleChrome();
  const { t, locale } = useCopy();
  const { session } = useSessionDesks();
  const centreOwner = session?.centreOwner !== false;
  const hostListingKnown = session != null && typeof session.hostListing === "boolean";
  const hostListing = session?.hostListing === true;
  const topRated = session?.topRated === true;
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [createListingOpen, setCreateListingOpen] = useState(false);
  useEffect(() => {
    if (!hostListing || !user?.id) return;
    void syncHostActionNotices().catch(() => undefined);
  }, [hostListing, user?.id]);
  const search = useSearch({ strict: false }) as ReturnType<typeof providerValidateSearch>;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const childRoute = pathname === "/provider/subscription" || pathname.startsWith("/provider/subscription/");
  const [desk, setDesk] = useState<DaycareDesk>(search.desk ?? DEFAULT_DESK);
  const [listings, setListings] = useState<Daycare[]>([]);
  const [showTestListings, setShowTestListings] = useState(false);
  const [stats, setStats] = useState<
    Array<{
      daycareId: string;
      views: number;
      inquiries: number;
      requests: number;
      weekViews?: number;
      weekRequests?: number;
      demand?: DemandSnapshot;
    }>
  >([]);
  const [requests, setRequests] = useState<SpotRequest[]>([]);
  const [tours, setTours] = useState<TourRequest[]>([]);
  const [leads, setLeads] = useState<LeadRequest[]>([]);
  const [pipeline, setPipeline] = useState<PipelineCard[]>([]);
  const [upgradeDismissed, setUpgradeDismissed] = useState(false);
  const [deskSettled, setDeskSettled] = useState(false);
  const [orgOn, setOrgOn] = useState(false);
  const [subscription, setSubscription] = useState<{
    selectedPlan: ProviderEntitlements["selectedPlan"];
    entitledPlan: ProviderEntitlements["entitledPlan"];
    stripeLive: boolean;
    paid: boolean;
    analyticsDays: number;
    orgDashboard: boolean;
    unlimitedInquiries: boolean;
    featuredCity: boolean;
    inquiryCap: number | null;
    inquiryUsed: number;
    siteCount: number;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    postalCode: "",
    licenseNumber: "",
    infantMonthly: 0,
    toddlerMonthly: 0,
    preschoolMonthly: 0,
    storefront: "",
    staffLanguages: [] as string[],
    culturalPrograms: [] as string[],
    culturalTeamNote: "",
  });
  const [storefrontError, setStorefrontError] = useState<string | null>(null);
  const [storefrontProgress, setStorefrontProgress] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  async function load() {
    try {
      const [res, incoming, tourRows, pipelineRows, leadRows] = await Promise.all([
        getProvider(),
        listDaycareIncoming(),
        listTourRequests({ data: { desk: "centre" } }).catch(() => [] as TourRequest[]),
        listCentrePipeline().catch(() => [] as PipelineCard[]),
        listLeadRequests({ data: { desk: "centre" } }).catch(() => [] as LeadRequest[]),
      ]);
      const nextListings = Array.isArray(res?.listings) ? res.listings : [];
      setListings(nextListings);
      setStats(res.stats);
      setSubscription(res.subscription);
      setUpgradeDismissed(Boolean(res.upgradeCardDismissed));
      setRequests(Array.isArray(incoming) ? incoming : []);
      setTours(Array.isArray(tourRows) ? tourRows : []);
      setPipeline(Array.isArray(pipelineRows) ? pipelineRows : []);
      setLeads(Array.isArray(leadRows) ? leadRows : []);
    } finally {
      setDeskSettled(true);
    }
  }

  useEffect(() => {
    if (!user?.id) return;
    void orgDeskStatus().then((row) => setOrgOn(row.enabled)).catch(() => setOrgOn(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || childRoute) return;
    void dedupedQuery(`provider-desk:${user.id}`, QUERY_STALE_MS, () => load().then(() => true)).catch(() => undefined);
  }, [user?.id, childRoute]);

  useEffect(() => {
    if (childRoute) return;
    const next = search.desk ?? DEFAULT_DESK;
    if (OWNER_DESKS.has(next) && deskSettled && !centreOwner) {
      setDesk(DEFAULT_DESK);
      void navigate({ to: "/provider", search: { desk: "today" }, replace: true });
      return;
    }
    setDesk(next);
  }, [search.desk, centreOwner, deskSettled, navigate, childRoute]);

  useEffect(() => {
    const focus = search.focus;
    if (!focus) return;
    const id = COACH_FOCUS_ANCHOR[focus];
    const timer = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.matches("input, textarea, button, select")
        ? el
        : el.querySelector<HTMLElement>("input, textarea, button, select");
      focusable?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [desk, search.focus, listings.length]);

  useEffect(() => {
    if (desk === "requests") capturePostHogEvent("provider_request_opened");
  }, [desk]);

  useEffect(() => {
    if (desk !== "listings" || window.location.hash !== "#list-new") return;
    setCreateListingOpen(true);
    const timer = window.setTimeout(() => {
      const node = document.getElementById("list-new");
      if (node instanceof HTMLDetailsElement) node.open = true;
      node?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [desk, listings.length]);

  if (childRoute) return <Outlet />;

  if (locallyOut) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (isPending) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user && (chrome.pending || chrome.signedIn)) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-16">
          <h1 className="font-display text-3xl">{t("providerGuestTitle")}</h1>
          <p className="mt-3 text-muted">{t("providerGuestLead")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link
                to="/login"
                search={{
                  role: "provider",
                  desk: "director",
                  intent: "in",
                  next: search.desk ? `/provider?desk=${search.desk}` : "/provider",
                }}
              >
                {t("providerGuestSignIn")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/claim">{t("providerGuestClaim")}</Link>
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  const waiting = requests.filter((r) => r.status === "requested" || r.status === "under_review");
  const later = requests.filter((r) => r.status !== "requested" && r.status !== "under_review");
  const operatorTools = canUseOperatorTools(session?.email);
  const testListingCount = listings.filter((d) => isAdminOnlyListing(d)).length;
  // getProvider already returns only centres this account owns or belongs to.
  // Their own demo stays on Today, listings, tours (calendar), and fees.
  // Public search and the sitemap still use isPublicListing.
  const focusedId = orgOn ? pickCentre(listings.map((row) => row.id), search.centre) : null;
  const deskListings = focusedId ? listings.filter((row) => row.id === focusedId) : listings;
  const gap = gapCopy(locale === "fr" ? "fr" : "en");

  return (
    <TwoFactorGate next={search.desk ? `/provider?desk=${search.desk}` : "/provider"}>
    <LoginFunnelDeskLand desk="provider" />
    {search.preview === "support" && operatorTools ? <SupportPreviewBanner /> : null}
    <DeskShell
      desk="daycare"
      headingMode={desk === "listings" && hostListing && !listingEditorOpen ? "aside" : "page"}
      active={desk}
      onSelect={(id) => {
        if (id === "add") {
          if (!centreOwner) return;
          setDesk("listings");
          setCreateListingOpen(true);
          queueMicrotask(() => {
            const el = document.getElementById("list-new");
            if (el instanceof HTMLDetailsElement) el.open = true;
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          return;
        }
        if (OWNER_DESKS.has(id as DaycareDesk) && !centreOwner) {
          setDesk(DEFAULT_DESK);
          return;
        }
        const nextDesk = id as DaycareDesk;
        setDesk(nextDesk);
        void navigate({ to: "/provider", search: { ...search, desk: nextDesk }, replace: true });
      }}
    >
      {desk === "insights" ? <ProviderInsightsDesk /> : null}
      {desk === "top-rated" ? <TopRatedDesk on={topRated} /> : null}
      {deskSettled && deskListings.length === 0 && centreOwner && desk !== "insights" ? (
        <ProviderOnboarding
          onShowForm={() => {
            setDesk("listings");
            setCreateListingOpen(true);
            queueMicrotask(() => {
              const el = document.getElementById("list-new");
              if (el instanceof HTMLDetailsElement) el.open = true;
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      ) : null}
      {desk !== "today" && search.claimed && listings[0] ? (
        <section className="mb-6 rounded-xl bg-primary/8 p-5 ring-1 ring-primary/20">
          <h2 className="font-display text-2xl">{t("claimSuccessTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t("claimSuccessLead")}</p>
        </section>
      ) : null}
      {desk === "today" ? <StoriesDeskLink /> : null}
      {desk === "today" ? <CurriculumDeskLink /> : null}
      {desk === "today" ? <OrgDeskLink /> : null}
      {focusedId ? (
        <p className="mb-4 text-sm">
          {gap.orgShowing} {deskListings[0]?.name}.{" "}
          <Link to="/provider" search={{ desk }} className="inline-flex min-h-11 items-center font-medium text-primary">
            {gap.orgAll}
          </Link>
        </p>
      ) : null}
      {desk === "today" && centreOwner ? <SafeArrivalPanel /> : null}
      {desk === "today" && centreOwner ? <ChildHealthLog /> : null}
      {desk === "today" ? <ChildCheckinDesk /> : null}
      {desk === "today" ? <EceJobDesk mode={centreOwner ? "daycare" : "staff"} /> : null}
      {desk === "today" && hostListing && deskListings.length > 0 ? (
        <HostTodayHome listings={deskListings} stats={stats} onChanged={() => void load()} />
      ) : null}
      {desk === "today" && !hostListing && deskListings.length > 0 ? (
        <>
        <DaycareDeskHome
          listings={deskListings}
          leads={leads}
          tours={tours}
          planName={
            subscription?.paid
              ? subscription.selectedPlan === "network"
                ? "Network"
                : "Pro"
              : FOUNDING_PAGE[foundingLocale(locale)].daycarePill
          }
          paid={Boolean(subscription?.paid)}
          renewsOn={chrome.renewsOn}
          inquiryUsed={subscription?.inquiryUsed ?? 0}
          inquiryCap={subscription?.inquiryCap ?? null}
          dismissed={upgradeDismissed}
          settled={deskSettled}
          onDismiss={() => {
            void dismissUpgradeCard()
              .then(() => setUpgradeDismissed(true))
              .catch(() => setUpgradeDismissed(false));
          }}
        />
        <TodayUrgencyHome
          listings={listings}
          tours={tours}
          leads={leads}
          onChanged={() => void load()}
          onOpenDesk={(next) => setDesk(next)}
        />
        </>
      ) : null}
      {desk === "requests" ? (
        <div className="min-w-0 max-w-full space-y-6">
        <CentreFamilyDocs />
        {leads.length === 0 && tours.length === 0 && pipeline.length === 0 && waiting.length === 0 ? (
          <EmptyState title={t("enquiriesEmptyTitle")} body={t("enquiriesEmptyLead")} />
        ) : (
        <section className="space-y-8">
          <DaycareLeadInbox items={leads} onChanged={() => void load()} />
          {pipeline.length ? <CentrePipeline cards={pipeline} /> : null}
          {tours.length ? (
          <div>
            <h2 className="font-display text-2xl">{t("pendingTours")}</h2>
            <p className="mt-1 text-sm text-muted">{t("pendingToursLead")}</p>
            <ul className="mt-4 space-y-3">
              {tours.map((tour) => (
                <li key={tour.id}>
                  <TourCard tour={tour} canRespond onChanged={() => void load()} />
                </li>
              ))}
            </ul>
          </div>
          ) : null}
          {waiting.length ? (
          <div>
            <h2 className="font-display text-2xl">{t("directorNudgeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("requestsWaitingLead")}</p>
            <RequestList
              items={waiting}
              empty={t("providerRequestsEmpty")}
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                confirmSuccess({
                  variant: "toast",
                  title:
                    decision === "approve"
                      ? t("requestApprovedToast")
                      : decision === "decline"
                        ? t("requestDeclinedToast")
                        : t("requestWaitingToast"),
                });
                await load();
              }}
              onChanged={() => void load()}
              locale={locale}
            />
          </div>
          ) : null}
          {later.length ? (
          <div>
            <h2 className="font-display text-2xl">{t("requestsDecidedTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("requestsDecidedLead")}</p>
            <RequestList
              items={later}
              empty={t("requestsDecidedEmpty")}
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                confirmSuccess({ variant: "toast", title: t("requestUpdatedToast") });
                await load();
              }}
              onChanged={() => void load()}
              locale={locale}
            />
          </div>
          ) : null}
        </section>
        )}
        </div>
      ) : null}

      {desk === "tours" ? (
        <div className="space-y-8">
          <TourCalendarPage audience="provider" />
          <TourAvailabilityDesk listings={listings} onSaved={() => void load()} />
        </div>
      ) : null}

      {desk === "calendar" && hostListing ? (
        <HostCalendarDesk
          listings={deskListings}
          centreFromUrl={search.centre}
          onCentre={(id) => {
            void navigate({ to: "/provider", search: { ...search, desk: "calendar", centre: id }, replace: true });
          }}
          onSaved={() => void load()}
        />
      ) : null}
      {desk === "calendar" && !hostListingKnown ? (
        <section className="mx-auto max-w-2xl px-4 py-6" data-ke="host-calendar" role="status" aria-live="polite" aria-busy="true">
          <h1 className="font-display text-2xl">{t("navCalendar")}</h1>
          <p className="mt-2 text-sm text-muted">{t("loading")}</p>
        </section>
      ) : null}
      {desk === "calendar" && hostListingKnown && !hostListing ? (
        <section className="mx-auto max-w-2xl px-4 py-6" data-ke="host-calendar">
          <h1 className="font-display text-2xl">{t("navCalendar")}</h1>
          <p className="mt-2 text-sm text-muted">{t("comingSoon")}</p>
        </section>
      ) : null}
      {desk === "listings" && hostListing ? (
        <HostListingsDesk
          listings={deskListings}
          onSaved={() => void load()}
          onOpenChange={setListingEditorOpen}
          onCreateListing={() => {
            setCreateListingOpen(true);
            queueMicrotask(() => {
              const el = document.getElementById("list-new");
              if (el instanceof HTMLDetailsElement) el.open = true;
              el?.scrollIntoView({ block: "start" });
              el?.querySelector<HTMLElement>("input, textarea, select")?.focus();
            });
          }}
          initialSection={search.section && isHostSection(search.section) ? search.section : hostSectionFromFocus(search.focus)}
          initialCentre={search.centre}
        />
      ) : null}
      {desk === "listings" && !hostListing ? <AgeOpenSpotsDesk listings={deskListings.map((row) => ({ id: row.id, name: row.name }))} /> : null}
      {desk === "listings" && !hostListing ? (
        <>
          {operatorTools ? (
          <label className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm ring-1 ring-border" data-ke="test-listing-toggle">
            <input type="checkbox" checked={showTestListings} onChange={(e) => setShowTestListings(e.target.checked)} />
            {t("showTestListings")}{testListingCount ? ` · ${testListingCount}` : ""}
          </label>
          ) : null}
          <ActionRequiredBanner listings={deskListings} />
          <DirectorNudgeQueue listings={deskListings} stats={stats} onConfirmed={() => void load()} skipConfirmSpots />
          <VacancyConfirmLoop listings={deskListings} onConfirmed={() => void load()} />
          <SpotOfferDesk includeTest={operatorTools && showTestListings} />
          {deskListings.length ? (
            <FreePageExplainer
              listings={deskListings.map((d) => ({
                slug: d.slug,
                name: d.name,
                nameFr: d.nameFr,
                lat: d.lat,
                lng: d.lng,
                address: d.address,
                city: d.city,
                province: d.province,
                postalCode: d.postalCode,
              }))}
            />
          ) : null}
          {deskListings.map((d) => {
            const st = stats.find((s) => s.daycareId === d.id);
            const declined = listingStatusFromClaim(d.claimStatus, { live: d.live }) === "declined";
            return (
              <section key={d.id} className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-display text-2xl hover:underline">
                        {storedCentreName(d.name, d.nameFr)}
                      </Link>
                      <ListingStatusBadge claimStatus={d.claimStatus} live={d.live} />
                    </div>
                    <p className="text-sm text-muted">
                      {d.address}, {d.city} · {officialLicenceNumber(d.licenseNumber, d.id) ?? t("trustLicenseUnverified")}
                    </p>
                    <TrustSignals item={d} surface="provider" compact className="mt-2" />
                    <KidEaseApprovalStrip eligible={publicApprovalEligible(d)} audience="daycare" />
                  </div>
                  {d.priority ? <PriorityPill /> : null}
                </div>
                <p className="mt-3 text-xs text-subtle">
                  {subscription?.analyticsDays === 90 ? t("analytics90") : t("analytics")}
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("views")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.views ?? 0}</dd>
                  </div>
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("inquiries")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.inquiries ?? 0}</dd>
                  </div>
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("conversion")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.requests ?? 0}</dd>
                  </div>
                </dl>
                <DemandCues snapshot={st?.demand} />
                <ClaimProgressMeter item={d} />
                <CompletenessChecklist item={d} />
                {declined ? (
                  <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
                    KidEase declined this listing. Parent requests and Promote stay off. Add another centre below, or wait for a re-review after Kyle asks for more.
                  </p>
                ) : null}
                <CapacityForm daycare={d} onSaved={() => load()} mode="listing" />
              </section>
            );
          })}
          {subscription?.orgDashboard && subscription.siteCount >= 3 ? (
            <section className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="font-display text-2xl">{t("planOrgLive")}</h2>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-md bg-bg p-3">
                  <dt className="text-muted">{t("views")}</dt>
                  <dd className="font-display text-2xl tabular-nums">
                    {stats.reduce((sum, s) => sum + s.views, 0)}
                  </dd>
                </div>
                <div className="rounded-md bg-bg p-3">
                  <dt className="text-muted">{t("inquiries")}</dt>
                  <dd className="font-display text-2xl tabular-nums">
                    {stats.reduce((sum, s) => sum + s.inquiries, 0)}
                  </dd>
                </div>
                <div className="rounded-md bg-bg p-3">
                  <dt className="text-muted">{t("conversion")}</dt>
                  <dd className="font-display text-2xl tabular-nums">
                    {stats.reduce((sum, s) => sum + s.requests, 0)}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </>
      ) : null}
      {desk === "listings" && centreOwner && !(hostListing && listingEditorOpen) ? (
          <details
            id="list-new"
            className="group rounded-xl bg-surface ring-1 ring-border"
            data-ke="list-missing-centre"
            hidden={hostListing && !createListingOpen ? true : undefined}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="font-display text-lg">{t("providerOnboardingListNew")}</span>
              <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-5 pb-5">
            <p className="text-sm text-muted">{t("publishListingMissing")}</p>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              data-ke="publish-listing-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (publishing) return;
                const next = mergeListingDraft(form, new FormData(e.currentTarget));
                setForm(next);
                const missing = listingPublishMissing(next);
                setMissingFields(missing);
                if (missing.length) {
                  const message = t("publishListingMissing");
                  setPublishMessage({ tone: "err", text: message });
                  toast.error(message);
                  return;
                }
                setPublishing(true);
                setPublishMessage(null);
                void createListing({ data: next })
                  .then((res) => {
                    if (res && res.ok === false) {
                      const message =
                        locale === "fr" ? t("daycareAlreadyListed") : res.message || DUPLICATE_LISTING_MESSAGE;
                      setPublishMessage({ tone: "err", text: message });
                      toast.error(message);
                      return;
                    }
                    const message = t("publishListingDone");
                    setPublishMessage({ tone: "ok", text: message });
                    confirmSuccess({
                      variant: "modal",
                      title: t("createListing"),
                      body: message,
                    });
                    setForm((s) => ({ ...s, storefront: "" }));
                    return load();
                  })
                  .catch((err) => {
                    const message = listingCreateErrorMessage(err);
                    const text = isDaycareAlreadyListedMessage(message)
                      ? duplicateListingUserMessage(locale)
                      : message || t("actionFailed");
                    setPublishMessage({ tone: "err", text });
                    toast.error(text);
                  })
                  .finally(() => setPublishing(false));
              }}
            >
              <Field name="name" required french={locale === "fr"} invalid={missingFields.includes("name")} label={t("centreName")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field name="licenseNumber" required french={locale === "fr"} invalid={missingFields.includes("licenseNumber")} label={t("licenceNo")} value={form.licenseNumber} onChange={(v) => setForm({ ...form, licenseNumber: v })} />
              <Field name="address" required french={locale === "fr"} invalid={missingFields.includes("address")} label={t("addressLabel")} value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <Field name="city" required french={locale === "fr"} invalid={missingFields.includes("city")} label={t("cityLabel")} value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field name="postalCode" required french={locale === "fr"} invalid={missingFields.includes("postalCode")} label={t("postalLabel")} value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} />
              <Field name="infantMonthly" label={`${t("infantFee")} CAD`} value={form.infantMonthly ? String(form.infantMonthly) : ""} onChange={(v) => setForm({ ...form, infantMonthly: Number(v) || 0 })} />
              <Field name="toddlerMonthly" label={`${t("toddlerFee")} CAD`} value={form.toddlerMonthly ? String(form.toddlerMonthly) : ""} onChange={(v) => setForm({ ...form, toddlerMonthly: Number(v) || 0 })} />
              <Field name="preschoolMonthly" label={`${t("preschoolFee")} CAD`} value={form.preschoolMonthly ? String(form.preschoolMonthly) : ""} onChange={(v) => setForm({ ...form, preschoolMonthly: Number(v) || 0 })} />
              <div className="sm:col-span-2">
                <p className="text-sm font-medium">{t("storefrontPhoto")}</p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                  {form.storefront ? (
                    <img src={form.storefront} alt="" className="h-36 w-full max-w-xs rounded-xl object-cover ring-1 ring-border sm:h-28 sm:w-40" />
                  ) : (
                    <div className="grid h-36 w-full max-w-xs place-items-center rounded-xl bg-bg text-sm text-muted ring-1 ring-dashed ring-border sm:h-28 sm:w-40">
                      {t("storefrontPhoto")}
                    </div>
                  )}
                  <label className="flex min-h-28 flex-1 cursor-pointer flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-border bg-bg px-4 py-3 text-sm">
                    <span className="font-medium text-primary">{t("storefrontCta")}</span>
                    <input
                      type="file"
                      accept={LISTING_PHOTO_ACCEPT}
                      className="sr-only"
                      data-ke="create-listing-photo"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setStorefrontError(null);
                        setStorefrontProgress(8);
                        void downgradeListingPhotoFile(file, {
                          targetBytes: listingPhotoByteBudget(1),
                          onProgress: setStorefrontProgress,
                        })
                          .then((value) => setForm((s) => ({ ...s, storefront: value })))
                          .catch((err) => {
                            const unreadable = err instanceof ListingPhotoPrepareError && err.code === "unreadable";
                            const message = t(unreadable ? "photoUnreadable" : "photoTooBig");
                            setStorefrontError(message);
                            toast.error(message);
                          })
                          .finally(() => setStorefrontProgress(null));
                      }}
                    />
                    {storefrontProgress !== null ? (
                      <div
                        data-ke="listing-photo-progress"
                        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={storefrontProgress}
                      >
                        <div className="h-full bg-primary" style={{ width: `${storefrontProgress}%` }} />
                      </div>
                    ) : null}
                    <UploadLimitHint hint={t("uploadPhotoHint")} error={storefrontError} />
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <ListingCultureFields
                  value={{
                    staffLanguages: form.staffLanguages,
                    culturalPrograms: form.culturalPrograms,
                    culturalTeamNote: form.culturalTeamNote,
                  }}
                  onChange={(culture) => setForm({ ...form, ...culture })}
                />
              </div>
              <div className="sm:col-span-2 flex flex-col items-start gap-2">
                <Button type="submit" data-ke="publish-listing" disabled={publishing} aria-busy={publishing}>
                  {publishing ? t("publishListingWorking") : t("createListing")}
                </Button>
                {publishMessage ? (
                  <p
                    data-ke="publish-listing-status"
                    role={publishMessage.tone === "err" ? "alert" : "status"}
                    className={publishMessage.tone === "err" ? "text-sm text-danger" : "text-sm text-ok"}
                  >
                    {publishMessage.text}
                  </p>
                ) : null}
              </div>
            </form>
            </div>
          </details>
      ) : null}

      {desk === "employees" ? <CentreEmployeesPanel canInvite={centreOwner} /> : null}
      {desk === "employees" ? <EceJobDesk mode="staff" /> : null}
      {desk === "staff" ? <StaffSchedulingDesk /> : null}
      {desk === "hours" ? <StaffTimesheetDesk /> : null}
      {desk === "tools" ? <CentreToolsDesk /> : null}
      {desk === "staff" ? <EceJobDesk mode="staff" /> : null}
      {desk === "stories" ? <LearningStoriesDesk /> : null}
      {desk === "learning" ? <CurriculumPackDesk /> : null}
      {desk === "sites" ? <OrgOccupancyDesk /> : null}

      {desk === "screening" ? <ProviderScreeningPanel /> : null}

      {desk === "licence" && !centreOwner ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
      ) : null}

      {desk === "licence" && centreOwner ? (
        !deskSettled ? null : deskListings.length === 0 ? (
          <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">
            {t("providerOnboardingLead")}
          </p>
        ) : (
          deskListings.map((d) => (
            <section key={d.id} className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="font-display text-2xl">{storedCentreName(d.name, d.nameFr)}</h2>
              <p className="mt-1 text-sm text-muted">{t("trustChecklistTitle")}</p>
              <ListingReadinessCoach item={d} variant="card" />
              <div className="mt-4">
                <ProviderTrustChecklist daycare={d} onSaved={() => void load()} />
              </div>
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="font-display text-xl">{t("licenceRecord")}</h3>
                <CapacityForm daycare={d} onSaved={() => load()} mode="licence" />
              </div>
            </section>
          ))
        )
      ) : null}

      {desk === "money" ? (
        centreOwner ? (
          <div className="space-y-6">
            <ProviderMoneyPanel />
            {deskListings[0]?.id ? <QboPanel daycareId={deskListings[0].id} /> : null}
            <CwelccPanel />
            <TaxReceiptStudio desk="centre" />
          </div>
        ) : (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
        )
      ) : null}

      {desk === "contract" ? (
        centreOwner ? (
          <>
            <ProviderContractsPanel />
            <CentreAgreementEditor />
          </>
        ) : (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
        )
      ) : null}

      {desk === "promote" ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("plansNotOffered")}</p>
      ) : null}
    </DeskShell>
    </TwoFactorGate>
  );
}

function ProviderOnboarding({ onShowForm }: { onShowForm: () => void }) {
  const { t } = useCopy();
  return (
    <section className="mb-6 rounded-xl bg-primary/8 p-5 ring-1 ring-primary/20">
      <h2 className="font-display text-2xl">{t("providerOnboardingTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("providerOnboardingLead")}</p>
      <p className="mt-2 text-sm font-medium">{t("listingStayFree")}</p>
      <ol className="mt-4 space-y-2 text-sm">
        <li>{t("providerOnboardingStep1")}</li>
        <li>{t("providerOnboardingStep2")}</li>
        <li>{t("providerOnboardingStep3")}</li>
      </ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/claim">{t("providerOnboardingClaim")}</Link>
        </Button>
        <Button type="button" variant="secondary" onClick={onShowForm}>
          {t("providerOnboardingListNew")}
        </Button>
      </div>
    </section>
  );
}

function RequestList({
  items,
  empty,
  onDecide,
  onChanged,
  locale,
}: {
  items: SpotRequest[];
  empty: string;
  onDecide: (id: string, decision: "approve" | "decline" | "waiting") => Promise<void>;
  onChanged?: () => void;
  locale: "en" | "fr" | string;
}) {
  const { t } = useCopy();
  const agreements = useCentreAgreementChips();
  if (!items.length) {
    return <p className="mt-4 rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">{empty}</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
      {items.map((r) => (
        <li key={r.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {r.parentName ?? t("parentLabel")} · {r.childName ?? t("child")}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {r.daycareName} · {r.birthdate ? formatAgeLabel(r.birthdate, locale as "en") : t(r.ageGroup)} ·{" "}
                {formatStart(r.startDate ?? r.startMonth, locale as "en")} · {scheduleLabel(r.schedule, r.days, locale as "en")}
              </p>
            </div>
            {r.conversationId ? (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/inbox/$id" params={{ id: r.conversationId }} search={{ view: "centre" }}>
                  {t("viewRespond")}
                </Link>
              </Button>
            ) : null}
          </div>
          {r.parentUserId ? (
            <BlockFamilyButton parentUserId={r.parentUserId} daycareId={r.daycareId} />
          ) : null}
          <ChildPacket child={r.child} allergies={r.allergies} epiPen={r.epiPen} note={r.parentNote} />
          <div className="mt-3 flex flex-wrap gap-2">
            {["accepted", "declined", "active", "cancelled"].includes(r.status) ? (
              <p className="text-xs text-muted">{t("requestAlready").replace("{status}", requestStatusLabel(r.status, t))}</p>
            ) : (
              <>
            <Button
              size="sm"
              variant={r.status === "accepted" ? "primary" : "secondary"}
              disabled={r.portfolioComplete === false || r.familyBlocked === true}
              onClick={() => void onDecide(r.id, "approve").catch((err) => toast.error(err instanceof Error ? err.message : t("requestUpdateFailed")))}
            >
              {t("approveRequest")}
            </Button>
            <Button
              size="sm"
              variant={r.status === "under_review" || r.status === "requested" ? "primary" : "secondary"}
              onClick={() => void onDecide(r.id, "waiting").catch((err) => toast.error(err instanceof Error ? err.message : t("requestUpdateFailed")))}
            >
              {t("waitingRequest")}
            </Button>
            <Button
              size="sm"
              variant={r.status === "declined" ? "primary" : "secondary"}
              onClick={() => void onDecide(r.id, "decline").catch((err) => toast.error(err instanceof Error ? err.message : t("requestUpdateFailed")))}
            >
              {t("declineRequest")}
            </Button>
              </>
            )}
          </div>
          <CentreRequestGuard request={r} onChanged={onChanged ?? (() => undefined)} />
          <AgreementRequestAction
            bookingId={r.id}
            bookingStatus={r.status}
            chip={agreements.chipFor(r.id)}
            enabled={agreements.enabled}
            onSent={agreements.refresh}
          />
        </li>
      ))}
    </ul>
  );
}

const REQUEST_STATUS_KEY: Record<string, CopyKey> = {
  requested: "statusRequested",
  under_review: "statusUnderReview",
  waitlist: "statusWaitlist",
  accepted: "statusAccepted",
  declined: "statusDeclined",
  active: "statusActive",
  cancelled: "statusCancelled",
};

function requestStatusLabel(status: string, t: (key: CopyKey) => string) {
  const key = REQUEST_STATUS_KEY[status];
  return key ? t(key) : status;
}

function ChildPacket({
  child,
  allergies,
  epiPen,
  note,
}: {
  child?: Child | null;
  allergies?: string;
  epiPen?: boolean;
  note?: string | null;
}) {
  const { t } = useCopy();
  const bits = [
    (allergies || child?.allergies) && `${t("allergies")}: ${allergies || child?.allergies}`,
    (epiPen || child?.epiPen) && t("epiPenBadge"),
    child?.medicalNotes && `${t("packetMedical")}: ${child.medicalNotes}`,
    child?.medications && `${t("packetMeds")}: ${child.medications}`,
    child?.diet && `${t("diet")}: ${child.diet}`,
    child?.foodsAvoid && `${t("packetAvoid")}: ${child.foodsAvoid}`,
    child?.napRoutine && `${t("packetNaps")}: ${child.napRoutine}`,
    child?.toilet && `${t("toilet")}: ${child.toilet}`,
    child?.homeLanguage && `${t("homeLanguage")}: ${child.homeLanguage}`,
    child?.emergencyName && `${t("packetEmergency")}: ${child.emergencyName} ${child.emergencyPhone || ""}`.trim(),
    child?.pickupPeople && `${t("packetPickup")}: ${child.pickupPeople}`,
    note && `${t("packetNote")}: ${note}`,
  ].filter(Boolean) as string[];
  if (!bits.length) {
    return <p className="mt-3 text-sm text-subtle">{t("packetLimited")}</p>;
  }
  return (
    <ul className="ph-no-capture mt-3 flex flex-wrap gap-1.5">
      {bits.map((b) => (
        <li key={b} className="rounded-full bg-bg px-2.5 py-1 text-xs text-muted ring-1 ring-border">
          {b}
        </li>
      ))}
    </ul>
  );
}
