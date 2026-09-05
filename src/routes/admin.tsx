import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { ListingStatusBadge, LedgerHonesty } from "@/components/listing-status-badge";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { listPlatformEvents } from "@/lib/server/notify";
import { decideCentre, listAdminCentres, type AdminCentreRow, type Decision } from "@/lib/server/admin-centres";
import { listAdminMoney, type AdminMoneyLedger, type AdminMoneyRow } from "@/lib/server/admin-money";
import { listAdminContracts, type AdminContractRow } from "@/lib/server/contracts";
import { AdminContractsPanel } from "@/components/admin-contracts";
import { AdminMailPanel } from "@/components/admin-mail";
import { Button } from "@/components/ui/button";
import { PROVINCES } from "@/lib/geo";
import { money } from "@/lib/utils";
import { isWaitingClaim, listingStatusFromClaim } from "@/lib/listing-status";

type AdminDesk = "queue" | "daycares" | "mail" | "contracts" | "money" | "activity";

export const Route = createFileRoute("/admin")({
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
  return isWaitingClaim(status);
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
  const [tab, setTab] = useState<AdminDesk>("queue");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPlatformEvents>>>([]);
  const [centres, setCentres] = useState<AdminCentreRow[]>([]);
  const [contracts, setContracts] = useState<AdminContractRow[]>([]);
  const [contractMode, setContractMode] = useState<"live" | "demo">("demo");
  const [contractBusy, setContractBusy] = useState<string | null>(null);
  const [ledger, setLedger] = useState<AdminMoneyLedger>({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [moneyQ, setMoneyQ] = useState("");
  const [moneyDir, setMoneyDir] = useState<"all" | "in" | "out">("all");
  const [openProv, setOpenProv] = useState<Record<string, boolean>>({});
  const [activityKind, setActivityKind] = useState("all");
  const [activityQ, setActivityQ] = useState("");

  async function refresh() {
    const [events, list, cash, envelopes] = await Promise.all([
      listPlatformEvents().catch(() => []),
      listAdminCentres().catch(() => []),
      listAdminMoney().catch(() => ({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 })),
      listAdminContracts().catch(() => ({ mode: "demo" as const, rows: [] })),
    ]);
    setRows(events);
    setCentres(list);
    setLedger(cash);
    setContracts(envelopes.rows);
    setContractMode(envelopes.mode);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user]);

  const admin = Boolean(ready && session?.desks.includes("admin"));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return centres;
    return centres.filter((c) =>
      [c.name, c.city, c.province, c.address, c.providerName, c.providerEmail, c.contactEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [centres, q]);

  const waitingOnYou = useMemo(
    () => filtered.filter((c) => isQueued(c.claimStatus)).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")),
    [filtered],
  );

  const byProvince = useMemo(() => {
    const map = new Map<string, AdminCentreRow[]>();
    for (const c of filtered) {
      const code = provCode(c.province);
      const list = map.get(code) ?? [];
      list.push(c);
      map.set(code, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = PROV_ORDER.indexOf(a);
      const ib = PROV_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((code) => ({ code, name: PROV_NAME[code] || code, rows: map.get(code) || [] }));
  }, [filtered]);

  const counts = useMemo(() => {
    const waiting = centres.filter((c) => listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt }) === "waiting").length;
    const approved = centres.filter((c) => listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt }) === "live").length;
    const declined = centres.filter((c) => listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt }) === "declined").length;
    return { waiting, approved, declined, all: centres.length };
  }, [centres]);

  const activityRows = useMemo(() => {
    const needle = activityQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (activityKind !== "all" && r.kind !== activityKind) return false;
      if (!needle) return true;
      return [r.kind, r.daycare_name, r.address, r.city, r.province, r.provider_name, r.provider_email, r.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, activityKind, activityQ]);
  const activityKinds = useMemo(() => {
    const set = new Set(rows.map((r) => r.kind).filter(Boolean));
    return ["all", ...[...set].sort()];
  }, [rows]);

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
      await decideCentre({ data: { daycareId, decision, note } });
      setNote("");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save that decision");
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
    <TwoFactorGate next="/admin">
    <DeskShell desk="admin" active={tab} onSelect={(id) => setTab(id as AdminDesk)}>
      {tab === "queue" || tab === "daycares" ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Waiting on you" value={counts.waiting} accent />
            <Stat label="Live" value={counts.approved} />
            <Stat label="Declined" value={counts.declined} />
            <Stat label="In this list" value={counts.all} />
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, email…" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note on next decision" className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border" />
          </div>
          {tab === "queue" ? (
            <section className="mt-8 overflow-hidden rounded-2xl bg-[#1a3790] text-primary-fg shadow-card">
              <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fg/70">Urgency</p>
                  <h2 className="mt-1 font-display text-2xl">Waiting on you</h2>
                </div>
                <p className="text-sm text-primary-fg/75">{waitingOnYou.length === 0 ? "Caught up" : `${waitingOnYou.length} to review`}</p>
              </div>
              {waitingOnYou.length === 0 ? (
                <p className="border-t border-white/10 px-5 py-8 text-sm text-primary-fg/70">No submitted daycares are waiting.</p>
              ) : (
                <ul className="divide-y divide-white/10 border-t border-white/10">
                  {waitingOnYou.map((c) => (
                    <CentreRow key={c.daycareId} c={c} busy={busy} onDecide={onDecide} invert />
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="mt-8">
              <h2 className="font-display text-2xl">By province</h2>
              <div className="mt-5 space-y-3">
                {byProvince.length === 0 ? (
                  <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">No daycares match that search yet.</p>
                ) : (
                  byProvince.map((group) => {
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
                          <ul className="divide-y divide-border border-t border-border">
                            {group.rows.map((c) => (
                              <CentreRow key={c.daycareId} c={c} busy={busy} onDecide={onDecide} />
                            ))}
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
      ) : tab === "mail" ? (
        <AdminMailPanel />
      ) : tab === "contracts" ? (
        <AdminContractsPanel rows={contracts} mode={contractMode} busy={contractBusy} setBusy={setContractBusy} onRefresh={refresh} />
      ) : tab === "money" ? (
        <MoneyPanel ledger={ledger} rows={moneyRows} q={moneyQ} setQ={setMoneyQ} dir={moneyDir} setDir={setMoneyDir} stripeLive={Boolean(session?.stripeLive)} />
      ) : (
        <>
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
                key={kind}
                type="button"
                onClick={() => setActivityKind(kind)}
                className={activityKind === kind ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}
              >
                {kind === "all" ? "All activity" : kind}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          {activityRows.length === 0 ? (
            <li className="p-8 text-center text-muted">No activity yet.</li>
          ) : (
            activityRows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-subtle">{r.kind}</p>
                    <p className="font-medium">{r.daycare_name || (r.kind === "account" ? "New account" : "Activity")}</p>
                    <p className="text-sm text-muted">{[r.address, r.city, r.province].filter(Boolean).join(", ") || "—"}</p>
                    <p className="mt-1 text-sm">
                      {r.kind === "claim" ? "Operator" : r.provider_name || "—"} · {r.provider_email || "no email"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{new Date(r.created_at).toLocaleString()}</p>
                    <p className="mt-1">email {r.email_status}</p>
                    {r.slug ? (
                      <Link to="/daycare/$slug" params={{ slug: r.slug }} className="text-primary underline-offset-4 hover:underline">
                        View listing
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        </>
      )}
    </DeskShell>
    </TwoFactorGate>
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
}: {
  ledger: AdminMoneyLedger;
  rows: AdminMoneyRow[];
  q: string;
  setQ: (v: string) => void;
  dir: "all" | "in" | "out";
  setDir: (v: "all" | "in" | "out") => void;
  stripeLive: boolean;
}) {
  return (
    <>
      <div className="mb-4">
        <h2 className="font-display text-2xl">Money</h2>
        <LedgerHonesty stripeLive={stripeLive} className="mt-1" />
        {!stripeLive ? <p className="mt-1 text-sm text-muted">Pending totals are not settled.</p> : null}
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

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-xl bg-primary px-4 py-3 text-primary-fg" : "rounded-xl bg-surface px-4 py-3 ring-1 ring-border"}>
      <dt className={`text-[11px] uppercase tracking-[0.14em] ${accent ? "text-primary-fg/70" : "text-subtle"}`}>{label}</dt>
      <dd className="mt-1 font-display text-2xl">{value}</dd>
    </div>
  );
}

function CentreRow({
  c,
  busy,
  onDecide,
  invert,
}: {
  c: AdminCentreRow;
  busy: string | null;
  onDecide: (id: string, d: Decision) => void;
  invert?: boolean;
}) {
  const muted = invert ? "text-primary-fg/70" : "text-muted";
  const status = listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt });
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{c.name}</p>
            <ListingStatusBadge claimStatus={c.claimStatus} live={c.live} claimedAt={c.claimedAt} invert={invert} />
          </div>
          <p className={`mt-1 text-sm ${muted}`}>
            {[c.city, c.province].filter(Boolean).join(", ")}
            {c.address ? ` · ${c.address}` : ""}
          </p>
          <p className={`mt-0.5 text-sm ${muted}`}>
            {c.providerName || "—"} · {c.providerEmail || c.contactEmail || "no email"}
          </p>
          {c.reviewedAt ? (
            <p className={`mt-0.5 text-xs ${muted}`}>Reviewed {new Date(c.reviewedAt).toLocaleString()}</p>
          ) : null}
          {!c.contactEmail && !c.providerEmail ? <p className={`mt-0.5 text-xs ${muted}`}>Missing email</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant={status === "live" ? "primary" : "secondary"} disabled={busy !== null} onClick={() => onDecide(c.daycareId, "approve")}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" disabled={busy !== null || status === "declined"} onClick={() => onDecide(c.daycareId, "info")}>
            Request info
          </Button>
          <Button size="sm" variant={status === "waiting" ? "primary" : "secondary"} disabled={busy !== null || status === "declined"} onClick={() => onDecide(c.daycareId, "waiting")}>
            Waiting
          </Button>
          <Button size="sm" variant={status === "declined" ? "danger" : "secondary"} disabled={busy !== null || status === "declined"} onClick={() => onDecide(c.daycareId, "decline")}>
            Decline
          </Button>
        </div>
      </div>
    </li>
  );
}
