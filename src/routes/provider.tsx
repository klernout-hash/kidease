import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityPill } from "@/components/priority-pill";
import { TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useSettledUser } from "@/lib/auth/use-current-user";
import { createListing, getProvider, setRole } from "@/lib/server/family";
import {
  DUPLICATE_LISTING_MESSAGE,
  duplicateListingUserMessage,
  isDaycareAlreadyListedMessage,
  listingCreateErrorMessage,
} from "@/lib/listing-identity";
import { decideParentRequest, listDaycareIncoming } from "@/lib/server/enrol-queue";
import { listTourRequests } from "@/lib/server/tours";
import { listLeadRequests } from "@/lib/server/lead-requests";
import { DaycareLeadInbox } from "@/components/daycare-lead-inbox";
import { TodayUrgencyHome } from "@/components/today-urgency-home";
import { DirectorProStrip } from "@/components/director-pro-strip";
import { type DaycareDesk } from "@/lib/desk-nav";
import { capturePostHogEvent } from "@/lib/posthog";
import { isOpenLeadStatus } from "@/lib/lead-requests";
import type { LeadRequest } from "@/lib/lead-requests";
import { listCentrePipeline } from "@/lib/server/crm-pipeline";
import { CentrePipeline } from "@/components/centre-pipeline";
import type { PipelineCard } from "@/lib/crm-pipeline";
import { TourCard } from "@/components/tour-card";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { storedCentreName } from "@/lib/utils";
import { formatAgeLabel, formatStart, scheduleLabel } from "@/lib/templates";
import type { Child, Daycare, SpotRequest, TourRequest } from "@/lib/types";
import { ProviderContractsPanel } from "@/components/provider-contracts";
import { ListingCultureFields } from "@/components/listing-culture-fields";
import { CapacityForm, Field, PromotePanel, readListingImage } from "@/components/provider-listing-forms";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import { isListingPhotoTooBig } from "@/lib/upload-limits";
import { TourAvailabilityDesk } from "@/components/tour-availability-desk";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { TrustSignals } from "@/components/trust-badge";
import { ProviderTrustChecklist } from "@/components/provider-trust";
import { listingStatusFromClaim } from "@/lib/listing-status";
import { publicApprovalEligible } from "@/lib/approve-live";
import { KidEaseApprovalStrip } from "@/components/kidease-approval";
import { officialLicenceNumber } from "@/lib/licensing";
import { ProviderMoneyPanel } from "@/components/provider-money";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { VacancyConfirmLoop } from "@/components/vacancy-confirm";
import { DirectorNudgeQueue } from "@/components/director-nudges";
import { ProviderPlanBanner } from "@/components/provider-plan-banner";
import { PayCtas, useShowPayCtas } from "@/components/pay-chrome";
import { FreePageExplainer } from "@/components/free-listing-share";
import { CompletenessChecklist } from "@/components/listing-completeness";
import { ActionRequiredBanner, ListingReadinessCoach } from "@/components/listing-readiness-coach";
import { COACH_FOCUS_ANCHOR, type ListingCoachFocus } from "@/lib/listing-verified";
import { DemandCues } from "@/components/rank-cues";
import type { DemandSnapshot } from "@/lib/demand-heat";
import type { ProviderEntitlements } from "@/lib/provider-entitlements";
import { CentreEmployeesPanel } from "@/components/centre-employees";
import { ProviderScreeningPanel } from "@/components/provider-screening";
import { useSessionDesks } from "@/components/desk-switcher";

const DESKS: DaycareDesk[] = ["today", "requests", "money", "listings", "tours", "licence", "contract", "promote", "employees", "screening"];
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

export const Route = createFileRoute("/provider")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: { desk?: DaycareDesk; preview?: "support"; claimed?: boolean; focus?: ListingCoachFocus } = {};
    const desk = typeof s.desk === "string" ? s.desk : "";
    if (DESKS.includes(desk as DaycareDesk)) out.desk = desk as DaycareDesk;
    if (s.preview === "support") out.preview = "support";
    if (s.claimed === true || s.claimed === "1" || s.claimed === "true") out.claimed = true;
    const focus = typeof s.focus === "string" ? s.focus : "";
    if (COACH_FOCUS.has(focus as ListingCoachFocus)) out.focus = focus as ListingCoachFocus;
    return out;
  },
  component: ProviderPage,
});

function ProviderPage() {
  const { user, isPending } = useSettledUser();
  const { t, locale } = useCopy();
  const showPay = useShowPayCtas();
  const { session } = useSessionDesks();
  const centreOwner = session?.centreOwner !== false;
  const search = Route.useSearch();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const childRoute = pathname === "/provider/subscription" || pathname.startsWith("/provider/subscription/");
  const [desk, setDesk] = useState<DaycareDesk>(search.desk ?? DEFAULT_DESK);
  const [showNewForm, setShowNewForm] = useState(false);
  const [listings, setListings] = useState<Daycare[]>([]);
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
    city: "Winnipeg",
    postalCode: "",
    licenseNumber: "",
    infantMonthly: 1200,
    toddlerMonthly: 1100,
    preschoolMonthly: 1000,
    storefront: "",
    staffLanguages: [] as string[],
    culturalPrograms: [] as string[],
    culturalTeamNote: "",
  });
  const [storefrontError, setStorefrontError] = useState<string | null>(null);
  const listingFormDirty =
    Boolean(form.name.trim() || form.address.trim() || form.postalCode.trim() || form.licenseNumber.trim() || form.storefront) ||
    form.city !== "Winnipeg" ||
    form.infantMonthly !== 1200 ||
    form.toddlerMonthly !== 1100 ||
    form.preschoolMonthly !== 1000 ||
    form.staffLanguages.length > 0 ||
    form.culturalPrograms.length > 0 ||
    Boolean(form.culturalTeamNote.trim());

  async function load() {
    const [res, incoming, tourRows, pipelineRows, leadRows] = await Promise.all([
      getProvider(),
      listDaycareIncoming(),
      listTourRequests({ data: { desk: "centre" } }).catch(() => [] as TourRequest[]),
      listCentrePipeline().catch(() => [] as PipelineCard[]),
      listLeadRequests({ data: { desk: "centre" } }).catch(() => [] as LeadRequest[]),
    ]);
    setListings(res.listings);
    setStats(res.stats);
    setSubscription(res.subscription);
    setRequests(incoming);
    setTours(tourRows);
    setPipeline(pipelineRows);
    setLeads(leadRows);
  }

  useEffect(() => {
    if (!user) return;
    void setRole({ data: "provider" }).then(() => load()).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (search.desk) setDesk(search.desk);
  }, [search.desk]);

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

  if (childRoute) return <Outlet />;

  if (isPending) {
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

  return (
    <TwoFactorGate next={search.desk ? `/provider?desk=${search.desk}` : "/provider"}>
    <LoginFunnelDeskLand desk="provider" />
    {search.preview === "support" ? <SupportPreviewBanner /> : null}
    <DeskShell
      desk="daycare"
      active={desk}
      onSelect={(id) => {
        if (id === "add") {
          if (!centreOwner) return;
          setDesk("listings");
          if (listings.length === 0) {
            setShowNewForm(false);
            return;
          }
          setShowNewForm(true);
          queueMicrotask(() => document.getElementById("list-new")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          return;
        }
        if (OWNER_DESKS.has(id as DaycareDesk) && !centreOwner) {
          setDesk(DEFAULT_DESK);
          return;
        }
        setDesk(id as DaycareDesk);
      }}
    >
      {desk !== "today" && listings.length === 0 && centreOwner ? (
        <ProviderOnboarding
          showForm={showNewForm}
          onShowForm={() => {
            setShowNewForm(true);
            setDesk("listings");
          }}
        />
      ) : null}
      {desk !== "today" && search.claimed && listings[0] ? (
        <section className="mb-6 rounded-xl bg-primary/8 p-5 ring-1 ring-primary/20">
          <h2 className="font-display text-2xl">{t("claimSuccessTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t("claimSuccessLead")}</p>
        </section>
      ) : null}
      {desk === "today" ? (
        <TodayUrgencyHome
          listings={listings}
          tours={tours}
          leads={leads}
          onChanged={() => void load()}
          onOpenDesk={(next) => setDesk(next)}
        />
      ) : null}
      {desk === "requests" ? (
        <section className="space-y-8">
          <PayCtas>
          <DirectorProStrip
            views={stats.reduce((sum, s) => sum + (s.weekViews ?? 0), 0)}
            requests={stats.reduce((sum, s) => sum + (s.weekRequests ?? 0), 0)}
          />
          </PayCtas>
          <p className="text-sm text-muted">
            {t("leadInbox")}
            {leads.filter((row) => isOpenLeadStatus(row.status)).length
              ? ` · ${leads.filter((row) => isOpenLeadStatus(row.status)).length}`
              : ""}
          </p>
          <DaycareLeadInbox items={leads} onChanged={() => void load()} />
          <CentrePipeline cards={pipeline} />
          <div>
            <h2 className="font-display text-2xl">{t("pendingTours")}</h2>
            <p className="mt-1 text-sm text-muted">{t("pendingToursLead")}</p>
            {tours.length === 0 ? (
              <p className="mt-4 rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">{t("noTours")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {tours.map((tour) => (
                  <li key={tour.id}>
                    <TourCard tour={tour} canRespond onChanged={() => void load()} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="font-display text-2xl">{t("directorNudgeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("requestsWaitingLead")}</p>
            <RequestList
              items={waiting}
              empty={t("providerRequestsEmpty")}
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                toast.success(
                  decision === "approve"
                    ? t("requestApprovedToast")
                    : decision === "decline"
                      ? t("requestDeclinedToast")
                      : t("requestWaitingToast"),
                );
                await load();
              }}
              locale={locale}
            />
          </div>
          <div>
            <h2 className="font-display text-2xl">{t("requestsDecidedTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("requestsDecidedLead")}</p>
            <RequestList
              items={later}
              empty={t("requestsDecidedEmpty")}
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                toast.success(t("requestUpdatedToast"));
                await load();
              }}
              locale={locale}
            />
          </div>
        </section>
      ) : null}

      {desk === "tours" ? <TourAvailabilityDesk listings={listings} onSaved={() => void load()} /> : null}

      {desk === "listings" ? (
        <>
          <ActionRequiredBanner listings={listings} />
          <DirectorNudgeQueue listings={listings} stats={stats} onConfirmed={() => void load()} />
          <VacancyConfirmLoop listings={listings} onConfirmed={() => void load()} />
          {listings.length ? (
            <FreePageExplainer
              listings={listings.map((d) => ({
                slug: d.slug,
                name: d.name,
                nameFr: d.nameFr,
                lat: d.lat,
                lng: d.lng,
              }))}
            />
          ) : null}
          <PayCtas>{subscription ? <ProviderPlanBanner subscription={subscription} /> : null}</PayCtas>
          {listings.map((d) => {
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
                  <PayCtas>
                  {d.featuredCity ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {t("planPro")} · featured
                    </span>
                  ) : null}
                  </PayCtas>
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
                <CompletenessChecklist item={d} />
                {declined ? (
                  <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
                    KidEase declined this listing. Parent requests and Promote stay off. Add another centre below, or wait for a re-review after Kyle asks for more.
                  </p>
                ) : null}
                <CapacityForm daycare={d} onSaved={() => void load()} mode="listing" />
              </section>
            );
          })}
          <PayCtas>
          {subscription && subscription.siteCount >= 3 && !subscription.orgDashboard ? (
            <p className="mb-6 rounded-xl bg-primary/10 px-5 py-4 text-sm text-primary ring-1 ring-primary/20">
              {t("planOrgLocked")}{" "}
              <Link to="/provider/subscription" className="font-medium underline">
                {t("planUpgrade")}
              </Link>
            </p>
          ) : null}
          </PayCtas>
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
          {listings.length === 0 && !showNewForm ? null : centreOwner ? (
          <section id="list-new" className="rounded-xl bg-surface p-5 ring-1 ring-border">
            {listings.length === 0 ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl">{t("listCentre")}</h2>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewForm(false)}>
                  {t("providerListNewHide")}
                </Button>
              </div>
            ) : (
            <h2 className="font-display text-2xl">{t("listCentre")}</h2>
            )}
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createListing({ data: form })
                  .then((res) => {
                    if (res && res.ok === false) {
                      toast.error(
                        locale === "fr" ? t("daycareAlreadyListed") : res.message || DUPLICATE_LISTING_MESSAGE,
                      );
                      return;
                    }
                    toast.success(t("createListing"));
                    setForm((s) => ({ ...s, storefront: "" }));
                    return load();
                  })
                  .catch((err) => {
                    const message = listingCreateErrorMessage(err);
                    toast.error(
                      isDaycareAlreadyListedMessage(message)
                        ? duplicateListingUserMessage(locale)
                        : message || "Error",
                    );
                  });
              }}
            >
              <Field label={t("centreName")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label={t("licenceNo")} value={form.licenseNumber} onChange={(v) => setForm({ ...form, licenseNumber: v })} />
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="Postal code" value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} />
              <Field label={`${t("infantFee")} CAD`} value={String(form.infantMonthly)} onChange={(v) => setForm({ ...form, infantMonthly: Number(v) || 0 })} />
              <Field label={`${t("toddlerFee")} CAD`} value={String(form.toddlerMonthly)} onChange={(v) => setForm({ ...form, toddlerMonthly: Number(v) || 0 })} />
              <Field label={`${t("preschoolFee")} CAD`} value={String(form.preschoolMonthly)} onChange={(v) => setForm({ ...form, preschoolMonthly: Number(v) || 0 })} />
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
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (isListingPhotoTooBig(file.size)) {
                          const message = t("photoTooBig");
                          setStorefrontError(message);
                          toast.error(message);
                          return;
                        }
                        setStorefrontError(null);
                        readListingImage(
                          file,
                          (value) => setForm((s) => ({ ...s, storefront: value })),
                          () => {
                            const message = t("photoTooBig");
                            setStorefrontError(message);
                            toast.error(message);
                          },
                        );
                      }}
                    />
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
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!listingFormDirty}>{t("createListing")}</Button>
              </div>
            </form>
          </section>
          ) : null}
        </>
      ) : null}

      {desk === "employees" ? <CentreEmployeesPanel canInvite={centreOwner} /> : null}

      {desk === "screening" ? <ProviderScreeningPanel /> : null}

      {desk === "licence" && !centreOwner ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
      ) : null}

      {desk === "licence" && centreOwner ? (
        listings.length === 0 ? (
          <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">
            {t("providerOnboardingLead")}
          </p>
        ) : (
          listings.map((d) => (
            <section key={d.id} className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="font-display text-2xl">{storedCentreName(d.name, d.nameFr)}</h2>
              <p className="mt-1 text-sm text-muted">{t("trustChecklistTitle")}</p>
              <ListingReadinessCoach item={d} variant="card" />
              <div className="mt-4">
                <ProviderTrustChecklist daycare={d} onSaved={() => void load()} />
              </div>
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="font-display text-xl">{t("licenceRecord")}</h3>
                <CapacityForm daycare={d} onSaved={() => void load()} mode="licence" />
              </div>
            </section>
          ))
        )
      ) : null}

      {desk === "money" ? (
        centreOwner ? (
          <ProviderMoneyPanel />
        ) : (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
        )
      ) : null}

      {desk === "contract" ? (
        centreOwner ? (
          <ProviderContractsPanel />
        ) : (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
        )
      ) : null}

      {desk === "promote" && !centreOwner ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("employeeStaffForbidden")}</p>
      ) : null}

      {desk === "promote" && centreOwner ? (
        !showPay ? (
          <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{t("plansNotOffered")}</p>
        ) : listings.length === 0 ? (
          <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">{t("providerOnboardingLead")}</p>
        ) : (
          listings.map((d) => {
            const declined = listingStatusFromClaim(d.claimStatus, { live: d.live }) === "declined";
            return (
            <section key={d.id} className="mb-6">
              <h2 className="font-display text-2xl">{storedCentreName(d.name, d.nameFr)}</h2>
              {declined ? (
                <p className="mt-3 rounded-xl bg-surface px-5 py-6 text-sm text-muted ring-1 ring-border">
                  {t("promoteDeclined")}
                </p>
              ) : (
                <PromotePanel daycare={d} onSaved={() => void load()} />
              )}
            </section>
            );
          })
        )
      ) : null}
    </DeskShell>
    </TwoFactorGate>
  );
}

function ProviderOnboarding({ showForm, onShowForm }: { showForm: boolean; onShowForm: () => void }) {
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
        {showForm ? null : (
          <Button type="button" variant="secondary" onClick={onShowForm}>
            {t("providerOnboardingListNew")}
          </Button>
        )}
      </div>
    </section>
  );
}

function RequestList({
  items,
  empty,
  onDecide,
  locale,
}: {
  items: SpotRequest[];
  empty: string;
  onDecide: (id: string, decision: "approve" | "decline" | "waiting") => Promise<void>;
  locale: "en" | "fr" | string;
}) {
  const { t } = useCopy();
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
          <ChildPacket child={r.child} allergies={r.allergies} epiPen={r.epiPen} note={r.parentNote} />
          <div className="mt-3 flex flex-wrap gap-2">
            {["accepted", "declined", "active", "cancelled"].includes(r.status) ? (
              <p className="text-xs text-muted">{t("requestAlready").replace("{status}", requestStatusLabel(r.status, t))}</p>
            ) : (
              <>
            <Button
              size="sm"
              variant={r.status === "accepted" ? "primary" : "secondary"}
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
