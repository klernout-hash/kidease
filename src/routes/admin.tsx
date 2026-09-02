import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listPlatformEvents } from "@/lib/server/notify";
import { decideCentre, listAdminCentres, type AdminCentreRow, type Decision } from "@/lib/server/admin-centres";
import { listAdminMoney, type AdminMoneyLedger, type AdminMoneyRow } from "@/lib/server/admin-money";
import { Button } from "@/components/ui/button";
import { PROVINCES } from "@/lib/geo";
import { money } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminPage });

const PROV_ORDER = PROVINCES.map((p) => p.code);
const PROV_NAME = Object.fromEntries(PROVINCES.map((p) => [p.code, p.name]));

function isQueued(status: string) {
  return status === "waiting" || status === "pending";
}

function provCode(raw: string | null | undefined) {
  const v = (raw || "").trim().toUpperCase();
  if (PROV_NAME[v]) return v;
  const hit = PROVINCES.find((p) => p.name.toUpperCase() === v || p.nameFr.toUpperCase() === v);
  return hit?.code || (v || "—");
}

function statusLabel(c: AdminCentreRow) {
  if (c.claimStatus === "approved" || c.live) return "Live";
  if (c.claimStatus === "declined") return "Declined";
  if (c.claimStatus === "pending") return "Submitted";
  return "Waiting";
}

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [tab, setTab] = useState<"queue" | "money" | "activity">("queue");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPlatformEvents>>>([]);
  const [centres, setCentres] = useState<AdminCentreRow[]>([]);
  const [ledger, setLedger] = useState<AdminMoneyLedger>({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [moneyQ, setMoneyQ] = useState("");
  const [moneyDir, setMoneyDir] = useState<"all" | "in" | "out">("all");
  const [openProv, setOpenProv] = useState<Record<string, boolean>>({});

  async function refresh() {
    const [events, list, cash] = await Promise.all([
      listPlatformEvents().catch(() => []),
      listAdminCentres().catch(() => []),
      listAdminMoney().catch(() => ({ rows: [], inPaid: 0, inPending: 0, outPaid: 0, outPending: 0, fees: 0 })),
    ]);
    setRows(events);
    setCentres(list);
    setLedger(cash);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user]);

  const admin = (user?.primaryEmail || "").trim().toLowerCase() === "kyle@kidease.ca";

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
    const waiting = centres.filter((c) => isQueued(c.claimStatus)).length;
    const approved = centres.filter((c) => c.claimStatus === "approved" || c.live).length;
    const declined = centres.filter((c) => c.claimStatus === "declined").length;
    return { waiting, approved, declined, all: centres.length };
  }, [centres]);

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
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for the KidEase operator.</p>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Operator</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">{tab === "money" ? "Money" : tab === "activity" ? "Activity" : "Daycares"}</h1>
            <p className="mt-2 max-w-xl text-muted">
              {tab === "money"
                ? "Every dollar in from parents and promo purchases, and every dollar out to daycares."
                : tab === "activity"
                  ? "Accounts, messages, payments, and claims. Alerts still go to kyle@kidease.ca."
                  : "New claims land in Waiting on you. Approve to go live, decline to keep them off search."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>
              Daycares
            </Button>
            <Button size="sm" variant={tab === "money" ? "primary" : "secondary"} onClick={() => setTab("money")}>
              Money
            </Button>
            <Button size="sm" variant={tab === "activity" ? "primary" : "secondary"} onClick={() => setTab("activity")}>
              Activity
            </Button>
          </div>
        </div>

        {tab === "queue" ? (
          <>
            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Waiting on you" value={counts.waiting} accent />
              <Stat label="Live" value={counts.approved} />
              <Stat label="Declined" value={counts.declined} />
              <Stat label="In this list" value={counts.all} />
            </dl>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, city, email…"
                className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note on next decision"
                className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
              />
            </div>

            <section className="mt-8 overflow-hidden rounded-2xl bg-[#1a3790] text-primary-fg shadow-card">
              <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fg/70">Urgency</p>
                  <h2 className="mt-1 font-display text-2xl">Waiting on you</h2>
                </div>
                <p className="text-sm text-primary-fg/75">
                  {waitingOnYou.length === 0 ? "Caught up" : `${waitingOnYou.length} to review`}
                </p>
              </div>
              {waitingOnYou.length === 0 ? (
                <p className="border-t border-white/10 px-5 py-8 text-sm text-primary-fg/70">
                  No submitted daycares are waiting. New claims appear here first.
                </p>
              ) : (
                <ul className="divide-y divide-white/10 border-t border-white/10">
                  {waitingOnYou.map((c) => (
                    <CentreRow key={c.daycareId} c={c} busy={busy} onDecide={onDecide} invert />
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="font-display text-2xl">By province</h2>
              <p className="mt-1 text-sm text-muted">Every submitted or live centre, grouped so you can scan a province at a time.</p>
              <div className="mt-5 space-y-3">
                {byProvince.length === 0 ? (
                  <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">
                    No daycares match that search yet.
                  </p>
                ) : (
                  byProvince.map((group) => {
                    const open = openProv[group.code] !== false;
                    const queued = group.rows.filter((c) => isQueued(c.claimStatus)).length;
                    return (
                      <div key={group.code} className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
                          onClick={() => setOpenProv((s) => ({ ...s, [group.code]: !open }))}
                        >
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
          </>
        ) : tab === "money" ? (
          <MoneyPanel ledger={ledger} rows={moneyRows} q={moneyQ} setQ={setMoneyQ} dir={moneyDir} setDir={setMoneyDir} />
        ) : (
          <section className="mt-8">
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
              {rows.length === 0 ? (
                <li className="p-8 text-center text-muted">No activity yet.</li>
              ) : (
                rows.map((r) => (
                  <li key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-subtle">{r.kind}</p>
                        <p className="font-medium">{r.daycare_name || (r.kind === "account" ? "New account" : "Activity")}</p>
                        <p className="text-sm text-muted">{[r.address, r.city, r.province].filter(Boolean).join(", ") || "—"}</p>
                        <p className="mt-1 text-sm">
                          {r.provider_name || "—"} · {r.provider_email || "no email"}
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
          </section>
        )}
      </main>
    </Shell>
  );
}

function MoneyPanel({
  ledger,
  rows,
  q,
  setQ,
  dir,
  setDir,
}: {
  ledger: AdminMoneyLedger;
  rows: AdminMoneyRow[];
  q: string;
  setQ: (v: string) => void;
  dir: "all" | "in" | "out";
  setDir: (v: "all" | "in" | "out") => void;
}) {
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CashStat label="In (paid)" value={ledger.inPaid} />
        <CashStat label="In (pending)" value={ledger.inPending} />
        <CashStat label="Out to daycares" value={ledger.outPaid + ledger.outPending} />
        <CashStat label="Platform fees" value={ledger.fees} />
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parent, centre, reference…"
          className="h-11 flex-1 rounded-full bg-surface px-4 text-sm ring-1 ring-border"
        />
        <div className="flex gap-2">
          {(
            [
              ["all", "All"],
              ["in", "Money in"],
              ["out", "Money out"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDir(key)}
              className={dir === key ? "rounded-full bg-primary px-3 py-2 text-sm text-primary-fg" : "rounded-full bg-surface px-3 py-2 text-sm ring-1 ring-border"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
        {rows.length === 0 ? (
          <li className="p-8 text-center text-muted">No payments yet. Parent tuition, promo buys, and daycare payouts show here.</li>
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
                    {r.reference ? ` · ${r.reference}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl tabular-nums">{r.direction === "out" ? "−" : "+"}{money(r.direction === "out" ? r.net || r.amount : r.amount)}</p>
                  {r.fee ? <p className="text-xs text-muted">fee {money(r.fee)}</p> : null}
                  {r.slug ? (
                    <Link to="/daycare/$slug" params={{ slug: r.slug }} className="text-xs text-primary underline-offset-4 hover:underline">
                      Listing
                    </Link>
                  ) : null}
                </div>
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
  const label = statusLabel(c);
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{c.name}</p>
            <span
              className={
                invert
                  ? "rounded-full bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide"
                  : label === "Live"
                    ? "rounded-full bg-primary/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-primary"
                    : label === "Declined"
                      ? "rounded-full bg-danger/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-danger"
                      : "rounded-full bg-surface-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted"
              }
            >
              {label}
            </span>
          </div>
          <p className={`mt-1 text-sm ${muted}`}>
            {[c.city, c.province].filter(Boolean).join(", ")}
            {c.address ? ` · ${c.address}` : ""}
          </p>
          <p className={`mt-0.5 text-sm ${muted}`}>
            {c.providerName || "—"} · {c.providerEmail || c.contactEmail || "no email"}
          </p>
          <p className={`mt-0.5 text-xs ${muted}`}>
            {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "No timestamp"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            to="/daycare/$slug"
            params={{ slug: c.slug }}
            className={invert ? "text-xs text-primary-fg underline-offset-4 hover:underline" : "text-xs text-primary underline-offset-4 hover:underline"}
          >
            Listing
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant={c.claimStatus === "approved" || c.live ? "primary" : "secondary"}
              disabled={busy !== null}
              onClick={() => onDecide(c.daycareId, "approve")}
            >
              {busy === `${c.daycareId}:approve` ? "…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant={isQueued(c.claimStatus) ? "primary" : "secondary"}
              disabled={busy !== null}
              onClick={() => onDecide(c.daycareId, "waiting")}
            >
              {busy === `${c.daycareId}:waiting` ? "…" : "Waiting"}
            </Button>
            <Button
              size="sm"
              variant={c.claimStatus === "declined" ? "danger" : "secondary"}
              disabled={busy !== null}
              onClick={() => onDecide(c.daycareId, "decline")}
            >
              {busy === `${c.daycareId}:decline` ? "…" : "Decline"}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
