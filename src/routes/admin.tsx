import { createFileRoute, Link } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { LedgerHonesty } from "@/components/listing-status-badge";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canVisitDesk } from "@/lib/desks";
import {
  ACTIVITY_KIND_CHIPS,
  ADMIN_PEOPLE_DAYS,
  adminDeskHref,
  activityAccountHeadline,
  activityEmailFailed,
  activityEmailStatusLabel,
  activityPeopleSearch,
  activityRoleBadge,
  activitySignupMeta,
  activityWhoLine,
  isAccountEventKind,
  isAdminDeskTab,
  isSignupActivityKind,
  parseAccountEventDetail,
  parseAdminActivityKind,
  resolveAdminTab,
  type AccountNotifyRole,
  type AdminDeskTab,
} from "@/lib/account-notify";
import { listPlatformEvents } from "@/lib/server/notify";
import { listAdminPeople, type AdminPersonRow } from "@/lib/server/admin-people";
import {
  ADMIN_IDLE_TIMEOUT_MESSAGE,
  adminCentresLoadMessage,
  isAdminIdleTimeoutMessage,
  settleAdminCentresLoad,
} from "@/lib/admin-centres-load";
import { ADMIN_LOGIN_SEARCH } from "@/lib/admin-desk-gate";
import { decideCentre, listAdminCentres, listIncompleteAdminCentres, type AdminCentreRow, type Decision } from "@/lib/server/admin-centres";
import { listJurisdictions, listListingReports, reviewLicense, type AdminReportRow, type LicenseReviewAction } from "@/lib/server/trust";
import { listAdminScreeningQueue, type AdminScreeningQueueRow } from "@/lib/server/provider-screening";
import { AdminTrustPanel } from "@/components/admin-trust";
import { AdminCentreStatList, AdminReviewCard } from "@/components/admin-review-card";
import { AdminScreeningQueue } from "@/components/admin-screening";
import { AdminIncompleteQueue } from "@/components/admin-incomplete";
import { JURISDICTIONS } from "@/lib/province-registry";
import { listAdminMoney, type AdminMoneyLedger, type AdminMoneyRow } from "@/lib/server/admin-money";
import { listAdminContracts, type AdminContractRow } from "@/lib/server/contracts";
import { AdminContractsPanel } from "@/components/admin-contracts";
import type { DocusignConfigIssue } from "@/lib/docusign-config";
import type { DocusignConnectIssue } from "@/lib/docusign-errors";
import type { DocusignTemplateOption } from "@/lib/docusign-packs";
import { AdminMailPanel } from "@/components/admin-mail";
import { AdminSentryTest } from "@/components/admin-sentry-test";
import { AdminStripeCatalog } from "@/components/admin-stripe-catalog";
import { PROVINCES } from "@/lib/geo";
import { money } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";
import { isQueueableClaimStatus } from "@/lib/listing-status";
import { needsLicenseReview, needsPhotoReview, needsVerification } from "@/lib/admin-verify";
import {
  ADMIN_CENTRE_STAT_COPY,
  ADMIN_LEAD_STAT_META,
  adminLeadStatHonesty,
  adminStatSearchValue,
  filterAdminCentresByStat,
  isAdminCentreListStat,
  isAdminLeadStat,
  parseAdminStatFilter,
  resolveAdminStat,
  selectAdminStat,
  tallyAdminCentreStats,
  type AdminStatFilter,
} from "@/lib/admin-stat-filter";
import { AdminReviewsPanel } from "@/components/admin-reviews";
import { compareTimeDesc } from "@/lib/sort-time";
import { staffQueueRows } from "@/lib/listing-visibility";
import { getCatalogHealth } from "@/lib/server/catalog-health";
import { listAdminLeadCounts } from "@/lib/server/lead-requests";
import { DAYCARE_INBOX_HREF, emptyLeadCounts, type LeadCounts } from "@/lib/lead-requests";
import type { CatalogRuntime } from "@/lib/catalog-source";
import { paymentSourceLabel } from "@/lib/payment-source";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";

export const Route = createFileRoute("/admin")({
  beforeLoad: beforeLoadAdminDesk,
  validateSearch: (s: Record<string, unknown>) => {
    const rawTab = typeof s.tab === "string" ? s.tab : null;
    const tab = isAdminDeskTab(rawTab) ? rawTab : undefined;
    const kindRaw = typeof s.kind === "string" ? s.kind : undefined;
    const kind = kindRaw ? parseAdminActivityKind(kindRaw) : undefined;
    const role = s.role === "parent" || s.role === "provider" ? (s.role as AccountNotifyRole) : undefined;
    const q = typeof s.q === "string" && s.q.trim() ? s.q : undefined;
    const stat = parseAdminStatFilter(typeof s.stat === "string" ? s.stat : undefined);
    const out: { tab?: AdminDeskTab; kind?: string; role?: AccountNotifyRole; q?: string; stat?: AdminStatFilter } = {};
    if (tab) out.tab = tab;
    else if (role) out.tab = "people";
    else if (kind && kind !== "all") out.tab = "activity";
    if (kind && kind !== "all") out.kind = kind;
    if (role) out.role = role;
    if (q) out.q = q;
    if (stat) out.stat = stat;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Admin · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

const PROV_ORDER = PROVINCES.map((p) => p.code);
const PROV_NAME = Object.fromEntries(PROVINCES.map((p) => [p.code, p.name]));

function isQueued(status: string) {
  return isQueueableClaimStatus(status);
}

function provCode(raw: string | null | undefined) {
  const v = (raw || "").trim().toUpperCase();
  if (PROV_NAME[v]) return v;
  const hit = PROVINCES.find((p) => p.name.toUpperCase() === v || p.nameFr.toUpperCase() === v);
  return hit?.code || (v || "—");
}

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const reauth = useReauthPrompt();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = resolveAdminTab(search);
  const stat = resolveAdminStat(tab, search.stat);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPlatformEvents>>>([]);
  const [people, setPeople] = useState<AdminPersonRow[]>([]);
  const [centres, setCentres] = useState<AdminCentreRow[]>([]);
  const [centresError, setCentresError] = useState<string | null>(null);
  const [centresReady, setCentresReady] = useState(false);
  const [contracts, setContracts] = useState<AdminContractRow[]>([]);
  const [contractMode, setContractMode] = useState<"live" | "demo">("demo");
  const [contractTemplates, setContractTemplates] = useState<DocusignTemplateOption[]>([]);
  const [contractDefaults, setContractDefaults] = useState<{
    provider_agreement: string | null;
    enrolment_pack: string | null;
  }>({ provider_agreement: null, enrolment_pack: null });
  const [contractError, setContractError] = useState<DocusignConnectIssue | null>(null);
  const [contractEnvIssues, setContractEnvIssues] = useState<DocusignConfigIssue[]>([]);
  const [contractLoadFailed, setContractLoadFailed] = useState(false);
  const [contractBusy, setContractBusy] = useState<string | null>(null);
  const [ledger, setLedger] = useState<AdminMoneyLedger>({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [moneyQ, setMoneyQ] = useState("");
  const [moneyDir, setMoneyDir] = useState<"all" | "in" | "out">("all");
  const [activityQ, setActivityQ] = useState("");
  const [peopleQ, setPeopleQ] = useState(search.q || "");
  const [showQaFixtures, setShowQaFixtures] = useState(false);
  const [openProv, setOpenProv] = useState<Record<string, boolean>>({});
  const [jurisdictions, setJurisdictions] = useState<Awaited<ReturnType<typeof listJurisdictions>>>([]);
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [screeningQueue, setScreeningQueue] = useState<AdminScreeningQueueRow[]>([]);
  const [catalogHealth, setCatalogHealth] = useState<CatalogRuntime | null>(null);
  const [leadCounts, setLeadCounts] = useState<LeadCounts>(emptyLeadCounts());

  function setTab(next: AdminDeskTab) {
    void navigate({
      to: "/admin",
      search: (prev) => ({
        tab: next,
        kind: next === "activity" ? prev.kind : undefined,
        role: next === "people" ? prev.role : undefined,
        q: next === "people" ? prev.q : undefined,
        stat: undefined,
      }),
      replace: true,
    });
  }

  function onSelectStat(next: AdminStatFilter) {
    const resolved = selectAdminStat(tab, next);
    void navigate({
      to: "/admin",
      search: {
        tab: resolved.tab,
        stat: adminStatSearchValue(resolved.tab, resolved.stat),
      },
      replace: true,
    });
  }

  async function refresh() {
    const [events, accounts, centresLoad, cash, envelopes, regs, flags, health, leads, screening] = await Promise.all([
      listPlatformEvents().catch(() => []),
      listAdminPeople().catch(() => []),
      settleAdminCentresLoad(() => listAdminCentres()),
      listAdminMoney().catch(() => ({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 })),
      listAdminContracts().catch(() => ({
        mode: "demo" as const,
        rows: [],
        templates: [],
        defaultTemplateIds: { provider_agreement: null, enrolment_pack: null },
        templateRole: "Provider",
        docusignError: null,
        docusignEnvIssues: [],
        docusignLoadFailed: true,
      })),
      listJurisdictions().catch(() => []),
      listListingReports().catch(() => []),
      getCatalogHealth().catch(() => null),
      listAdminLeadCounts().catch(() => emptyLeadCounts()),
      listAdminScreeningQueue().catch(() => []),
    ]);
    setRows(events);
    setPeople(accounts);
    if (centresLoad.ok) {
      setCentres(centresLoad.list);
      setCentresError(null);
      setCentresReady(true);
    } else {
      setCentresError(adminCentresLoadMessage(centresLoad.error));
    }
    setLedger(cash);
    setContracts(envelopes.rows);
    setContractMode(envelopes.mode);
    setContractTemplates(envelopes.templates || []);
    setContractDefaults(envelopes.defaultTemplateIds || { provider_agreement: null, enrolment_pack: null });
    setContractError(envelopes.docusignError || null);
    setContractEnvIssues(envelopes.docusignEnvIssues || []);
    setContractLoadFailed(Boolean(envelopes.docusignLoadFailed));
    setJurisdictions(regs);
    setReports(flags);
    setCatalogHealth(health);
    setLeadCounts(leads);
    setScreeningQueue(screening);
  }

  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role, session.email));

  useEffect(() => {
    if (!user || !admin) return;
    void refresh();
  }, [user, admin]);

  useEffect(() => {
    setPeopleQ(search.q || "");
  }, [search.q]);

  const staffCentres = useMemo(() => staffQueueRows(centres, showQaFixtures), [centres, showQaFixtures]);
  const qaCount = useMemo(() => centres.filter((c) => c.isTest).length, [centres]);
  const queueUnavailable = Boolean(centresError) && !centresReady;
  const queueStat = (value: number) => (queueUnavailable ? "—" : value);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return staffCentres;
    return staffCentres.filter((c) =>
      [c.name, c.city, c.province, c.address, c.providerName, c.providerEmail, c.contactEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [staffCentres, q]);

  const waitingOnYou = useMemo(
    () => filtered.filter((c) => isQueued(c.claimStatus)).sort((a, b) => compareTimeDesc(a.submittedAt, b.submittedAt)),
    [filtered],
  );

  const verifyQueue = useMemo(
    () =>
      filtered
        .filter((c) => needsVerification(c))
        .sort((a, b) => compareTimeDesc(a.submittedAt, b.submittedAt) || a.name.localeCompare(b.name)),
    [filtered],
  );

  const incompleteQueue = useMemo(() => listIncompleteAdminCentres(filtered), [filtered]);
  const listed = useMemo(() => {
    const rows =
      stat === "license"
        ? filtered.filter((c) => needsLicenseReview(c))
        : stat === "photo"
          ? filtered.filter((c) => needsPhotoReview(c))
          : filterAdminCentresByStat(filtered, stat);
    if (stat === "waiting") {
      return [...rows].sort((a, b) => compareTimeDesc(a.submittedAt, b.submittedAt));
    }
    if (stat === "live" || stat === "declined" || stat === "license" || stat === "photo") {
      return [...rows].sort((a, b) => compareTimeDesc(a.submittedAt, b.submittedAt) || a.name.localeCompare(b.name));
    }
    return rows;
  }, [filtered, stat]);
  const verifyListed = stat === "license" || stat === "photo" ? listed : verifyQueue;
  const provinceRows = isAdminCentreListStat(stat) ? listed : filtered;

  const byProvince = useMemo(() => {
    const map = new Map<string, AdminCentreRow[]>();
    for (const c of provinceRows) {
      const code = provCode(c.province);
      const list = map.get(code) ?? [];
      list.push(c);
      map.set(code, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }
    const keys = [...new Set([...PROV_ORDER, ...map.keys()])].sort((a, b) => {
      const ia = PROV_ORDER.indexOf(a);
      const ib = PROV_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((code) => ({
      code,
      name: PROV_NAME[code] || JURISDICTIONS.find((j) => j.code === code)?.nameEn || code,
      rows: map.get(code) || [],
    }));
  }, [provinceRows]);

  const counts = useMemo(() => tallyAdminCentreStats(staffCentres), [staffCentres]);

  const activityKind = parseAdminActivityKind(search.kind);
  const peopleRole = search.role === "parent" || search.role === "provider" ? search.role : "all";

  const activityRows = useMemo(() => {
    const needle = activityQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (activityKind !== "all" && r.kind !== activityKind) return false;
      if (!needle) return true;
      return [r.kind, r.daycare_name, r.address, r.city, r.province, r.provider_name, r.provider_email, r.detail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, activityKind, activityQ]);
  const activityKinds = useMemo(() => {
    const extra = [...new Set(rows.map((r) => r.kind).filter((k) => k && !ACTIVITY_KIND_CHIPS.some((c) => c.id === k)))].sort();
    return [...ACTIVITY_KIND_CHIPS, ...extra.map((id) => ({ id, label: id }))];
  }, [rows]);

  const peopleRows = useMemo(() => {
    const needle = peopleQ.trim().toLowerCase();
    return people.filter((p) => {
      if (peopleRole !== "all" && p.role !== peopleRole) return false;
      if (!needle) return true;
      return [p.name, p.email, p.phone, p.city, p.role].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [people, peopleQ, peopleRole]);

  const moneyRows = useMemo(() => {
    const needle = moneyQ.trim().toLowerCase();
    return ledger.rows.filter((r) => {
      if (moneyDir !== "all" && r.direction !== moneyDir) return false;
      if (!needle) return true;
      return [r.daycareName, r.city, r.partyName, r.partyEmail, r.kind, r.status, r.method, r.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [ledger.rows, moneyQ, moneyDir]);

  async function onDecide(daycareId: string, decision: Decision) {
    setBusy(`${daycareId}:${decision}`);
    try {
      await withReauth(
        () => decideCentre({ data: { daycareId, decision, note } }),
        reauth.prompt,
      );
      setNote("");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save that decision");
    } finally {
      setBusy(null);
    }
  }

  async function onLicense(daycareId: string, action: LicenseReviewAction) {
    setBusy(`${daycareId}:${action}`);
    try {
      await reviewLicense({ data: { daycareId, action, note } });
      setNote("");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save that licence review");
    } finally {
      setBusy(null);
    }
  }

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for KidEase staff with profiles.role = admin.</p>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next={adminDeskHref(search)}>
    <LoginFunnelDeskLand desk="admin" />
    <DeskShell desk="admin" active={tab} onSelect={(id) => setTab(id as AdminDeskTab)}>
      {centresError ? (
        <AdminCentresLoadBanner
          message={centresError}
          onRetry={() => void refresh()}
        />
      ) : null}
      {tab === "incomplete" ? (
        <>
          <div role="group" aria-label="Filter this list" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Needs complete" value={queueStat(incompleteQueue.length)} accent={stat === "incomplete"} filterId="incomplete" onSelect={() => onSelectStat("incomplete")} />
            <Stat label="Waiting claims" value={queueStat(waitingOnYou.length)} accent={stat === "waiting"} filterId="waiting" onSelect={() => onSelectStat("waiting")} />
            <Stat label="Licence review" value={queueStat(filtered.filter((c) => needsLicenseReview(c)).length)} accent={stat === "license"} filterId="license" onSelect={() => onSelectStat("license")} />
            <Stat label="Live" value={queueStat(counts.approved)} accent={stat === "live"} filterId="live" onSelect={() => onSelectStat("live")} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, email…" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note on next decision" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <label className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm ring-1 ring-border">
              <input type="checkbox" checked={showQaFixtures} onChange={(e) => setShowQaFixtures(e.target.checked)} />
              Show QA fixtures{qaCount ? ` · ${qaCount}` : ""}
            </label>
          </div>
          <div className="mt-8">
            <AdminIncompleteQueue
              rows={incompleteQueue}
              contracts={contracts}
              busy={busy}
              onDecide={onDecide}
              error={queueUnavailable ? centresError : null}
            />
          </div>
        </>
      ) : tab === "verify" ? (
        <>
          <div role="group" aria-label="Filter this list" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Needs a look" value={queueStat(verifyQueue.length)} accent={stat === "verify"} filterId="verify" onSelect={() => onSelectStat("verify")} />
            <Stat label="Licence review" value={queueStat(filtered.filter((c) => needsLicenseReview(c)).length)} accent={stat === "license"} filterId="license" onSelect={() => onSelectStat("license")} />
            <Stat label="Photo review" value={queueStat(filtered.filter((c) => needsPhotoReview(c)).length)} accent={stat === "photo"} filterId="photo" onSelect={() => onSelectStat("photo")} />
            <Stat label="Waiting claims" value={queueStat(waitingOnYou.length)} accent={stat === "waiting"} filterId="waiting" onSelect={() => onSelectStat("waiting")} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, email…" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note on next decision" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <label className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm ring-1 ring-border">
              <input type="checkbox" checked={showQaFixtures} onChange={(e) => setShowQaFixtures(e.target.checked)} />
              Show QA fixtures{qaCount ? ` · ${qaCount}` : ""}
            </label>
          </div>
          {!showQaFixtures && qaCount > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {qaCount} QA / Claim Lab fixture{qaCount === 1 ? "" : "s"} hidden from this production queue. Toggle Show QA fixtures to review the ghost listing separately.
            </p>
          ) : null}
          <section className="mt-8 overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-border" data-ke="admin-stat-list" data-ke-stat-list={stat}>
            <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Verify</p>
                <h2 className="mt-1 font-display text-2xl">
                  {stat === "license" ? "Licence review" : stat === "photo" ? "Photo review" : "Licence and photo review"}
                </h2>
              </div>
              <p className="text-sm text-muted">
                {queueUnavailable ? "Unavailable" : verifyListed.length === 0 ? "Caught up" : `${verifyListed.length} to review`}
              </p>
            </div>
            <p className="border-t border-border px-5 py-3 text-sm text-muted">
              Open the uploaded licence and storefront. Mark the registry match. This is not an inspection score.
            </p>
            {queueUnavailable ? (
              <p className="border-t border-border px-5 py-8 text-sm text-danger" role="alert">
                {centresError}
              </p>
            ) : verifyListed.length === 0 ? (
              <p className="border-t border-border px-5 py-8 text-sm text-muted">No claims or licence photos are waiting.</p>
            ) : (
              <ul className="space-y-4 border-t border-border bg-bg p-3 sm:p-4">
                {verifyListed.map((c) => (
                  <li key={c.daycareId}>
                    <AdminReviewCard
                      centre={c}
                      packs={contracts.find((row) => row.daycareId === c.daycareId)?.packs}
                      busy={busy}
                      onDecide={onDecide}
                      onLicense={onLicense}
                      mode="verify"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : tab === "queue" || tab === "daycares" ? (
        <>
          <div role="group" aria-label="Filter this list" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Waiting on you" value={queueStat(counts.waiting)} accent={stat === "waiting"} filterId="waiting" onSelect={() => onSelectStat("waiting")} />
            <Stat label="Needs complete" value={queueStat(incompleteQueue.length)} accent={stat === "incomplete"} filterId="incomplete" onSelect={() => onSelectStat("incomplete")} />
            <Stat label="Live" value={queueStat(counts.approved)} accent={stat === "live"} filterId="live" onSelect={() => onSelectStat("live")} />
            <Stat label="Declined" value={queueStat(counts.declined)} accent={stat === "declined"} filterId="declined" onSelect={() => onSelectStat("declined")} />
            <Stat label="In this list" value={queueStat(counts.all)} accent={stat === "all"} filterId="all" onSelect={() => onSelectStat("all")} />
            <Stat label="Open leads" value={leadCounts.open} accent={stat === "leads-open"} filterId="leads-open" onSelect={() => onSelectStat("leads-open")} />
            <Stat label="Leads confirmed" value={leadCounts.confirmed} accent={stat === "leads-confirmed"} filterId="leads-confirmed" onSelect={() => onSelectStat("leads-confirmed")} />
            <Stat label="Leads answered" value={leadCounts.answered} accent={stat === "leads-answered"} filterId="leads-answered" onSelect={() => onSelectStat("leads-answered")} />
            <Stat label="Leads declined" value={leadCounts.declined} accent={stat === "leads-declined"} filterId="leads-declined" onSelect={() => onSelectStat("leads-declined")} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, email…" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note on next decision" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <label className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm ring-1 ring-border">
              <input type="checkbox" checked={showQaFixtures} onChange={(e) => setShowQaFixtures(e.target.checked)} />
              Show QA fixtures{qaCount ? ` · ${qaCount}` : ""}
            </label>
          </div>
          {!showQaFixtures && qaCount > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {qaCount} QA / Claim Lab fixture{qaCount === 1 ? "" : "s"} hidden from Live and Waiting counts. Toggle to review TEST Ghost Claim Lab separately.
            </p>
          ) : null}
          {isAdminLeadStat(stat) ? (
            <LeadStatPanel stat={stat} count={leadCounts[ADMIN_LEAD_STAT_META[stat].countKey]} />
          ) : tab === "queue" ? (
            <AdminCentreStatList
              stat={isAdminCentreListStat(stat) ? stat : "waiting"}
              rows={listed}
              unavailable={queueUnavailable}
              error={centresError}
              contracts={contracts}
              busy={busy}
              onDecide={onDecide}
              onLicense={onLicense}
            />
          ) : (
            <section className="mt-8">
              {catalogHealth ? (
                <p
                  className="mb-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-border"
                  data-catalog-runtime={catalogHealth.runtime}
                >
                  <span className="font-medium text-fg">
                    Catalogue SoT · {catalogHealth.runtime === "neon" ? "Neon" : "JSON fallback"}
                  </span>
                  <span className="mt-1 block">{catalogHealth.reason}</span>
                  <span className="mt-2 block" data-facility-type-taxonomy>
                    Facility types: child care centre (fallback), family child care (`home`), group child care home (`group-home`), nursery school (`nursery`), school-age (`in-school`). Name tokens are an admin gap only — never assigned at random. US-style aliases map and stay off empty filters.
                  </span>
                </p>
              ) : null}
              <h2 className="font-display text-2xl">By province</h2>
              {isAdminCentreListStat(stat) && stat !== "all" ? (
                <p className="mt-2 text-sm text-muted" data-ke="admin-stat-list" data-ke-stat-list={stat}>
                  {ADMIN_CENTRE_STAT_COPY[stat].title}
                  {queueUnavailable ? "" : ` · ${listed.length} centre${listed.length === 1 ? "" : "s"}`}
                </p>
              ) : null}
              <div className="mt-5 space-y-3">
                {queueUnavailable ? (
                  <p className="rounded-xl bg-surface px-5 py-8 text-center text-danger ring-1 ring-danger/20" role="alert">
                    {centresError}
                  </p>
                ) : listed.length === 0 ? (
                  <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">
                    {isAdminCentreListStat(stat) ? ADMIN_CENTRE_STAT_COPY[stat].empty : "No daycares match that search yet."}
                  </p>
                ) : (
                  byProvince.filter((group) => stat === "all" || group.rows.length > 0).map((group) => {
                    const open = openProv[group.code] !== false;
                    const queued = group.rows.filter((c) => isQueued(c.claimStatus)).length;
                    return (
                      <div key={group.code} className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                        <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left" onClick={() => setOpenProv((s) => ({ ...s, [group.code]: !open }))}>
                          <span className="font-display text-lg">
                            {group.name}
                            <span className="ml-2 text-sm font-sans font-normal text-muted">{group.code}</span>
                          </span>
                          <span className="text-xs text-muted">
                            {queued ? `${queued} waiting · ` : ""}
                            {group.rows.length} centre{group.rows.length === 1 ? "" : "s"}
                          </span>
                        </button>
                        {open ? (
                          <ul className="space-y-3 border-t border-border bg-bg p-3 sm:p-4">
                            {group.rows.length === 0 ? (
                              <li className="px-2 py-2 text-sm text-muted">No claims in this jurisdiction yet. Registry review stays manual.</li>
                            ) : (
                              group.rows.map((c) => (
                                <li key={c.daycareId}>
                                  <AdminReviewCard
                                    centre={c}
                                    packs={contracts.find((row) => row.daycareId === c.daycareId)?.packs}
                                    busy={busy}
                                    onDecide={onDecide}
                                    onLicense={onLicense}
                                  />
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </>
      ) : tab === "trust" ? (
        <AdminTrustPanel jurisdictions={jurisdictions} reports={reports} />
      ) : tab === "screening" ? (
        <AdminScreeningQueue rows={screeningQueue} onChanged={() => void refresh()} />
      ) : tab === "mail" ? (
        <AdminMailPanel />
      ) : tab === "contracts" ? (
        <AdminContractsPanel
          rows={contracts}
          mode={contractMode}
          templates={contractTemplates}
          defaultTemplateIds={contractDefaults}
          docusignError={contractError}
          docusignEnvIssues={contractEnvIssues}
          docusignLoadFailed={contractLoadFailed}
          busy={contractBusy}
          setBusy={setContractBusy}
          onRefresh={refresh}
        />
      ) : tab === "money" ? (
        <MoneyPanel ledger={ledger} rows={moneyRows} q={moneyQ} setQ={setMoneyQ} dir={moneyDir} setDir={setMoneyDir} stripeLive={Boolean(session?.stripeLive)} ready={ready} />
      ) : tab === "reviews" ? (
        <AdminReviewsPanel />
      ) : tab === "people" ? (
        <PeoplePanel
          rows={peopleRows}
          all={people}
          q={peopleQ}
          setQ={(v) => {
            setPeopleQ(v);
            void navigate({
              to: "/admin",
              search: {
                tab: "people",
                role: peopleRole === "all" ? undefined : peopleRole,
                q: v.trim() || undefined,
              },
              replace: true,
            });
          }}
          role={peopleRole}
          onRole={(next) => {
            void navigate({
              to: "/admin",
              search: { tab: "people", role: next === "all" ? undefined : next },
              replace: true,
            });
          }}
        />
      ) : (
        <>
        <AdminSentryTest />
        <div className="mb-4">
          <h2 className="font-display text-2xl">Activity</h2>
          <p className="mt-1 text-sm text-muted">
            Platform log only. New parents and daycare providers always show name · email · role. Filter, then open People or the listing.
          </p>
        </div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={activityQ}
            onChange={(e) => setActivityQ(e.target.value)}
            placeholder="Search activity…"
            className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
          />
          <div className="flex flex-wrap gap-2">
            {activityKinds.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/admin",
                    search: { tab: "activity", kind: kind.id === "all" ? undefined : kind.id },
                    replace: true,
                  });
                }}
                className={activityKind === kind.id ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          {activityRows.length === 0 ? (
            <li className="p-8 text-center">
              {rows.length === 0 ? (
                <>
                  <p className="font-medium">No platform events yet.</p>
                  <p className="mt-2 text-sm text-muted">
                    Claims, approvals, chat, and new accounts appear here. Start on Waiting on you or Licence & photos when a centre submits.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">No activity matches that filter.</p>
                  <p className="mt-2 text-sm text-muted">Clear the search or switch the kind chip to All.</p>
                </>
              )}
            </li>
          ) : (
            activityRows.map((r) => {
              const badge = activityRoleBadge(r.kind, r.detail);
              const extra = parseAccountEventDetail(r.detail);
              const who = activityWhoLine(r);
              const meta = activitySignupMeta(r);
              const mailFailed = activityEmailFailed(r.email_status);
              const peopleSearch = activityPeopleSearch(r);
              return (
              <li key={r.id} className={mailFailed ? "bg-danger/5 p-4" : "p-4"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-wide text-subtle">{r.kind}</p>
                      {badge ? <RoleBadge label={badge} /> : null}
                      {mailFailed ? (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                          {activityEmailStatusLabel(r.email_status)}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium">{activityAccountHeadline(r)}</p>
                    <p className="text-sm text-muted">
                      {isAccountEventKind(r.kind) || r.kind === "listing"
                        ? [r.city, r.province].filter(Boolean).join(", ") || "—"
                        : [r.address, r.city, r.province].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p className="mt-1 text-sm">{who}</p>
                    {isSignupActivityKind(r.kind) ? (
                      <p className="mt-0.5 text-xs text-subtle">
                        {[meta.who, meta.role, meta.city, meta.time].join(" · ")}
                      </p>
                    ) : null}
                    {isAccountEventKind(r.kind) && (extra.phone || extra.authMethod) ? (
                      <p className="mt-0.5 text-xs text-subtle">
                        {[extra.phone, extra.authMethod].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{new Date(r.created_at).toLocaleString("en-CA", { timeZone: "America/Winnipeg", dateStyle: "medium", timeStyle: "short" })}</p>
                    {mailFailed ? null : <p className="mt-1">{activityEmailStatusLabel(r.email_status)}</p>}
                    {r.slug ? (
                      <Link to="/daycare/$slug" params={{ slug: r.slug }} className="text-primary underline-offset-4 hover:underline">
                        View listing
                      </Link>
                    ) : null}
                    {isSignupActivityKind(r.kind) || isAccountEventKind(r.kind) ? (
                      <Link
                        to="/admin"
                        search={peopleSearch}
                        className="mt-1 block text-primary underline-offset-4 hover:underline"
                      >
                        Open People
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
              );
            })
          )}
        </ul>
        </>
      )}
    </DeskShell>
      {reauth.dialog}
    </TwoFactorGate>
  );
}

function RoleBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
      {label}
    </span>
  );
}

function PeoplePanel({
  rows,
  all,
  q,
  setQ,
  role,
  onRole,
}: {
  rows: AdminPersonRow[];
  all: AdminPersonRow[];
  q: string;
  setQ: (v: string) => void;
  role: "all" | AccountNotifyRole;
  onRole: (v: "all" | AccountNotifyRole) => void;
}) {
  return (
    <>
      <div className="mb-4">
        <h2 className="font-display text-2xl">People</h2>
        <p className="mt-1 text-sm text-muted">
          Parents and daycare providers who created an account in the last {ADMIN_PEOPLE_DAYS} days. Search by name or email.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="In this window" value={all.length} accent />
        <Stat label="Parents" value={all.filter((p) => p.role === "parent").length} />
        <Stat label="Daycare providers" value={all.filter((p) => p.role === "provider").length} />
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
        />
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["parent", "Parents"],
            ["provider", "Daycare providers"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onRole(key)}
              className={role === key ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {rows.length === 0 ? (
          <li className="p-8 text-center">
            {all.length === 0 ? (
              <>
                <p className="font-medium">No new parents or daycare providers in the last {ADMIN_PEOPLE_DAYS} days.</p>
                <p className="mt-2 text-sm text-muted">New signups appear here with name, email, and role. Activity still logs the same people.</p>
              </>
            ) : (
              <>
                <p className="font-medium">No people match that filter.</p>
                <p className="mt-2 text-sm text-muted">Clear the search or switch the role chip to All.</p>
              </>
            )}
          </li>
        ) : (
          rows.map((p) => (
            <li key={p.userId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name?.trim() || "—"}</p>
                    <RoleBadge label={p.role === "provider" ? "Daycare" : "Parent"} />
                  </div>
                  <p className="mt-1 text-sm">{p.email || "no email"}</p>
                  <p className="text-sm text-muted">
                    {[p.city, p.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <p className="text-right text-xs text-muted">
                  {new Date(p.createdAt).toLocaleString("en-CA", {
                    timeZone: "America/Winnipeg",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function MoneyPanel({
  ledger,
  rows,
  q,
  setQ,
  dir,
  setDir,
  stripeLive,
  ready = true,
}: {
  ledger: AdminMoneyLedger;
  rows: AdminMoneyRow[];
  q: string;
  setQ: (v: string) => void;
  dir: "all" | "in" | "out";
  setDir: (v: "all" | "in" | "out") => void;
  stripeLive: boolean;
  ready?: boolean;
}) {
  const { t } = useCopy();
  return (
    <>
      <div className="mb-4">
        <h2 className="font-display text-2xl">Money</h2>
        <LedgerHonesty stripeLive={stripeLive} className="mt-1" ready={ready} />
        {ready && !stripeLive ? (
          <p className="mt-2 text-sm text-muted">Pending totals are not settled. There is no payout, refund, or parent Pay CTA while Stripe is off.</p>
        ) : null}
        {ready && stripeLive ? (
          <p className="mt-2 text-sm text-muted">
            {t("connectFeeAdminLive")} {paymentSourceLabel(true)} for paid / refunded / disputed bills.
            The internal row is a projection of signed webhooks — do not mark paid by hand.
          </p>
        ) : null}
        <AdminStripeCatalog />
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CashStat label="In (paid)" value={ledger.inPaid} />
        <CashStat label="In (pending)" value={ledger.inPending} />
        <CashStat label="Out to daycares" value={ledger.outPaid + ledger.outPending} />
        <CashStat label="Platform fees" value={ledger.fees} />
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parent, centre, reference…" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
        <div className="flex gap-2">
          {([["all", "All"], ["in", "Money in"], ["out", "Money out"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setDir(key)} className={dir === key ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {rows.length === 0 ? (
          <li className="p-8 text-center text-muted">No payments yet.</li>
        ) : (
          rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={r.direction === "in" ? "rounded-full bg-ok/15 px-2 py-0.5 text-[11px] uppercase tracking-wide text-ok" : "rounded-full bg-danger/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-danger"}>
                      {r.direction === "in" ? "In" : "Out"}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-subtle">{r.kind}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] uppercase text-muted">{r.status}</span>
                  </div>
                  <p className="mt-1 font-medium">{r.daycareName || "KidEase"}</p>
                  <p className="text-sm text-muted">
                    {r.partyName || r.partyEmail || "—"}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.method ? ` · ${r.method}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <p className="font-display text-2xl tabular-nums">
                  {r.direction === "out" ? "−" : "+"}
                  {money(r.direction === "out" ? r.net || r.amount : r.amount)}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function CashStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums">{money(value)}</dd>
    </div>
  );
}

function AdminCentresLoadBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const idle = isAdminIdleTimeoutMessage(message);
  return (
    <div
      className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
      data-ke="admin-centres-error"
      role="alert"
    >
      <p className="font-medium">{idle ? ADMIN_IDLE_TIMEOUT_MESSAGE : message}</p>
      <p className="mt-1 text-danger/80">
        Waiting and Incomplete counts are unavailable until this load succeeds.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={onRetry}>
          Try again
        </button>
        {idle ? (
          <Link to="/login" search={ADMIN_LOGIN_SEARCH} className="font-medium underline-offset-4 hover:underline">
            Sign in again
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  onSelect,
  filterId,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  onSelect?: () => void;
  filterId?: string;
}) {
  const labelClass = `block text-[11px] uppercase tracking-[0.14em] ${accent ? "text-primary-fg/70" : "text-subtle"}`;
  const valueClass = "mt-1 block font-display text-2xl";
  const boxClass = accent
    ? "rounded-xl bg-primary px-4 py-3 text-left text-primary-fg"
    : "rounded-xl bg-surface px-4 py-3 text-left ring-1 ring-border";
  if (!onSelect) {
    return (
      <div className={boxClass}>
        <dt className={labelClass}>{label}</dt>
        <dd className={valueClass}>{value}</dd>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${boxClass} w-full transition-colors hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`}
      aria-pressed={Boolean(accent)}
      data-ke="admin-stat"
      data-ke-stat={filterId}
      onClick={onSelect}
    >
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </button>
  );
}

function LeadStatPanel({ stat, count }: { stat: Parameters<typeof adminLeadStatHonesty>[0]; count: number }) {
  const copy = adminLeadStatHonesty(stat, count);
  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-border" data-ke="admin-lead-stat" data-ke-stat-list={stat}>
      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Lead requests</p>
        <h2 className="mt-1 font-display text-2xl">{copy.title}</h2>
      </div>
      <div className="border-t border-border px-5 py-8 text-sm text-muted">
        <p>{copy.body}</p>
        <p className="mt-3">
          <a href={DAYCARE_INBOX_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
            Open centre lead inbox
          </a>
        </p>
      </div>
    </section>
  );
}

