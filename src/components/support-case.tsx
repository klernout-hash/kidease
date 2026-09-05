import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  addSupportNote,
  assignSupportCase,
  changeSupportStatus,
  getSupportCase,
  getSupportCentre360,
  getSupportPerson360,
  listSupportMoney,
  listSupportStaff,
  logSupportPreview,
  refundSupportBill,
  type Centre360,
  type Person360,
  type SupportCaseDetail,
  type SupportMoneyRow,
} from "@/lib/server/support";
import {
  SUPPORT_CASE_STATUSES,
  SUPPORT_MACROS,
  canRefundUnlimited,
  stripeDashboardPaymentUrl,
  supportStatusLabel,
  supportTypeLabel,
  type SupportCaseStatus,
  type SupportStaff,
} from "@/lib/support";
import { billStatusLabel } from "@/lib/bill";
import { money } from "@/lib/utils";

function goSupportTab(id: string) {
  if (typeof window === "undefined") return;
  window.location.assign(id === "new" ? "/support?tab=new" : "/support");
}

export function SupportCaseView({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [person, setPerson] = useState<Person360 | null>(null);
  const [centre, setCentre] = useState<Centre360 | null>(null);
  const [moneyRows, setMoneyRows] = useState<SupportMoneyRow[]>([]);
  const [staff, setStaff] = useState<SupportStaff[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await getSupportCase({ data: caseId });
      setDetail(next);
      setError(null);
      const [p, c, m, s] = await Promise.all([
        next.case.parentUserId
          ? getSupportPerson360({ data: next.case.parentUserId }).catch(() => null)
          : Promise.resolve(null),
        next.case.centreId || next.case.listingId
          ? getSupportCentre360({ data: next.case.centreId || next.case.listingId }).catch(() => null)
          : Promise.resolve(null),
        listSupportMoney({ data: caseId }).catch(() => ({ rows: [] as SupportMoneyRow[] })),
        listSupportStaff().catch(() => []),
      ]);
      setPerson(p);
      setCentre(c);
      setMoneyRows(m.rows);
      setStaff(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load case");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  if (error) {
    return (
      <DeskShell desk="support" active="inbox" onSelect={goSupportTab}>
        <EmptyState title="Case unavailable" body={error} action="Back to inbox" actionTo="/support" />
      </DeskShell>
    );
  }
  if (!detail) {
    return (
      <DeskShell desk="support" active="inbox" onSelect={goSupportTab}>
        <p className="text-muted">Loading case…</p>
      </DeskShell>
    );
  }

  const c = detail.case;

  return (
    <DeskShell desk="support" active="inbox" onSelect={goSupportTab}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
            {supportTypeLabel(c.type)} · {c.priority}
          </p>
          <h2 className="mt-1 font-display text-2xl">{c.subject}</h2>
          <p className="mt-1 text-sm text-muted">
            {supportStatusLabel(c.status)}
            {c.assigneeName ? ` · ${c.assigneeName}` : " · Unassigned"}
            {c.parentEmail ? ` · ${c.parentEmail}` : ""}
            {c.centreName ? ` · ${c.centreName}` : ""}
          </p>
        </div>
        <Link to="/support" className="text-sm text-primary underline-offset-4 hover:underline">
          Inbox
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8">
          <Timeline events={detail.events} />
          <MoneyDrawer
            rows={moneyRows}
            stripeLive={detail.stripeLive}
            caseId={c.id}
            actorRole={detail.actorRole}
            refundMaxCents={detail.refundMaxCents}
            onDone={refresh}
          />
          <PersonPanel person={person} parentLinked={Boolean(c.parentUserId)} />
          <CentrePanel centre={centre} centreLinked={Boolean(c.centreId || c.listingId)} />
        </div>
        <ActionsRail
          caseId={c.id}
          status={c.status}
          assigneeUserId={c.assigneeUserId}
          staff={staff}
          onDone={refresh}
        />
      </div>
    </DeskShell>
  );
}

function Timeline({ events }: { events: SupportCaseDetail["events"] }) {
  if (!events.length) {
    return (
      <section className="rounded-2xl bg-surface ring-1 ring-border">
        <EmptyState title="No timeline yet" body="Add a note from the rail." />
      </section>
    );
  }
  return (
    <section>
      <h3 className="font-display text-xl">Timeline</h3>
      <ol className="mt-3 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
            <p className="text-xs uppercase tracking-wide text-subtle">
              {e.kind}
              {e.actorName ? ` · ${e.actorName}` : ""}
              {` · ${new Date(e.createdAt).toLocaleString()}`}
            </p>
            {e.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{e.body}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActionsRail({
  caseId,
  status,
  assigneeUserId,
  staff,
  onDone,
}: {
  caseId: string;
  status: SupportCaseStatus;
  assigneeUserId: string | null;
  staff: SupportStaff[];
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState(status);
  const [assignee, setAssignee] = useState(assigneeUserId ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveNote(macroId?: string, body?: string) {
    const text = (body ?? note).trim();
    if (!text) return;
    setBusy("note");
    try {
      await addSupportNote({ data: { caseId, body: text, macroId } });
      setNote("");
      toast.success("Note saved");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="space-y-5 rounded-2xl bg-surface p-4 ring-1 ring-border lg:sticky lg:top-24">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">Actions</p>
        <label className="mt-3 block text-sm">
          Note
          <textarea
            rows={4}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          {SUPPORT_MACROS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded-full px-2 py-1 text-[11px] ring-1 ring-border hover:bg-surface-2"
              onClick={() => {
                setNote(m.body);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Button className="mt-2 w-full" type="button" disabled={busy === "note"} onClick={() => void saveNote()}>
          Add note
        </Button>
      </div>
      <label className="block text-sm">
        Status
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as SupportCaseStatus)}
        >
          {SUPPORT_CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {supportStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        className="w-full"
        type="button"
        disabled={busy === "status"}
        onClick={async () => {
          setBusy("status");
          try {
            await changeSupportStatus({ data: { caseId, status: nextStatus } });
            toast.success("Status updated");
            await onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not change status");
          } finally {
            setBusy(null);
          }
        }}
      >
        Change status
      </Button>
      <label className="block text-sm">
        Assignee
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name || s.email || s.userId} ({s.role})
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        className="w-full"
        type="button"
        disabled={busy === "assign"}
        onClick={async () => {
          setBusy("assign");
          try {
            await assignSupportCase({ data: { caseId, assigneeUserId: assignee || null } });
            toast.success("Assignment saved");
            await onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not assign");
          } finally {
            setBusy(null);
          }
        }}
      >
        Assign
      </Button>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">View-as (banner only)</p>
        <p className="mt-2 text-xs text-muted">
          Opens your own desk with a banner. No write impersonation — TODO if we ever add a
          read-only session.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <PreviewLink caseId={caseId} desk="parent" />
          <PreviewLink caseId={caseId} desk="provider" />
        </div>
      </div>
    </aside>
  );
}

function PreviewLink({ caseId, desk }: { caseId: string; desk: "parent" | "provider" }) {
  return (
    <a
      href={desk === "parent" ? "/parent?preview=support" : "/provider?preview=support"}
      className="text-sm text-primary underline-offset-4 hover:underline"
      onClick={() => {
        void logSupportPreview({ data: { caseId, desk } }).catch(() => undefined);
      }}
    >
      Preview as {desk}
    </a>
  );
}

function MoneyDrawer({
  rows,
  stripeLive,
  caseId,
  actorRole,
  refundMaxCents,
  onDone,
}: {
  rows: SupportMoneyRow[];
  stripeLive: boolean;
  caseId: string;
  actorRole: string;
  refundMaxCents: number;
  onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const unlimited = canRefundUnlimited(actorRole);

  return (
    <section>
      <h3 className="font-display text-xl">Money</h3>
      <p className="mt-1 text-sm text-muted">
        {stripeLive
          ? "Stripe live. Refunds call the Stripe API; bill status waits for charge.refunded."
          : "Internal ledger — refund rehearses a case event only. No fake Paid or Refunded state."}
        {unlimited
          ? " Support lead / admin: no agent cap."
          : ` Agent cap: ${refundMaxCents} cents (SUPPORT_REFUND_MAX_CENTS).`}
      </p>
      {rows.length === 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          <EmptyState title="No related bills" body="Link a parent or centre on the case, or attach a bill id when you open one." />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const pi = row.stripePaymentIntentId;
            const dash = stripeDashboardPaymentUrl(pi || row.stripeChargeId, stripeLive);
            return (
              <li key={row.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {row.number} · {money(Math.round(row.amountCents / 100))}
                    </p>
                    <p className="text-sm text-muted">
                      {billStatusLabel(row.status)} · {row.period}
                      {row.daycareName ? ` · ${row.daycareName}` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-subtle">
                  PI {pi || "—"}
                  {row.stripeChargeId ? ` · ch ${row.stripeChargeId}` : ""}
                </p>
                {dash ? (
                  <a
                    href={dash}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Open in Stripe Dashboard
                  </a>
                ) : null}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-sm">
                    Refund cents
                    <input
                      type="number"
                      min={1}
                      max={row.amountCents}
                      className="mt-1 h-10 w-32 rounded-md border border-border bg-background px-2"
                      value={amount[row.id] ?? String(row.amountCents)}
                      onChange={(e) => setAmount((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    />
                  </label>
                  <Button
                    type="button"
                    disabled={busy === row.id}
                    onClick={async () => {
                      setBusy(row.id);
                      try {
                        const cents = Math.floor(Number(amount[row.id] ?? row.amountCents) || 0);
                        const res = await refundSupportBill({
                          data: { caseId, billId: row.id, amountCents: cents },
                        });
                        toast.success(res.message);
                        await onDone();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Refund failed");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Refund
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PersonPanel({ person, parentLinked }: { person: Person360 | null; parentLinked: boolean }) {
  return (
    <section>
      <h3 className="font-display text-xl">Person 360</h3>
      <p className="mt-1 text-sm text-muted">Read-only compose of profile, desks, kids, claims, bills, Plus.</p>
      {!parentLinked || !person || person.empty ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          <EmptyState
            title="No parent on this case"
            body="Search a parent when you open a case. We will not invent a profile."
          />
        </div>
      ) : (
        <dl className="mt-3 grid gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-border sm:grid-cols-2">
          <Fact label="Name" value={person.user?.name || "—"} />
          <Fact label="Email" value={person.user?.email || "—"} />
          <Fact label="Role" value={person.profile?.role || "—"} />
          <Fact label="Desks" value={person.desks.join(", ") || "—"} />
          <Fact label="City" value={person.profile?.city || "—"} />
          <Fact label="Phone" value={person.profile?.phone || "—"} />
          <Fact
            label="Kids"
            value={
              person.kids.length
                ? person.kids.map((k) => k.name).join(", ")
                : "None on file"
            }
          />
          <Fact
            label="Parent Plus"
            value={person.plus ? `${person.plus.plan} · ${person.plus.status || "no status"}` : "Not loaded"}
          />
          <Fact
            label="Claims"
            value={
              person.claims.length
                ? person.claims.map((c) => `${c.daycareName || "centre"} (${c.status})`).join("; ")
                : "None"
            }
          />
          <Fact
            label="Bills"
            value={
              person.bills.length
                ? person.bills.map((b) => `${b.number} ${b.status}`).join("; ")
                : "None"
            }
          />
        </dl>
      )}
    </section>
  );
}

function CentrePanel({ centre, centreLinked }: { centre: Centre360 | null; centreLinked: boolean }) {
  return (
    <section>
      <h3 className="font-display text-xl">Centre 360</h3>
      <p className="mt-1 text-sm text-muted">Listing, trust/licence, claims, vacancy freshness, open bills.</p>
      {!centreLinked || !centre || centre.empty || !centre.listing ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          <EmptyState title="No centre on this case" body="Attach a listing when the issue is about a daycare." />
        </div>
      ) : (
        <dl className="mt-3 grid gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-border sm:grid-cols-2">
          <Fact label="Centre" value={centre.listing.name} />
          <Fact
            label="Place"
            value={[centre.listing.city, centre.listing.province].filter(Boolean).join(", ") || "—"}
          />
          <Fact label="Licence" value={centre.listing.licenseNumber || "Not on file"} />
          <Fact label="Licence status" value={centre.listing.licenseStatus || "—"} />
          <Fact label="Registry" value={centre.listing.registryMatch || "—"} />
          <Fact
            label="Vacancy"
            value={
              centre.listing.vacancy.kind === "unknown"
                ? "Unknown — no last confirm"
                : `${centre.listing.vacancy.kind}${centre.listing.lastVacancyUpdatedAt ? ` · ${centre.listing.lastVacancyUpdatedAt}` : ""}`
            }
          />
          <Fact
            label="Claim history"
            value={
              centre.claims.length
                ? centre.claims.map((c) => `${c.status} (${c.createdAt.slice(0, 10)})`).join("; ")
                : "None"
            }
          />
          <Fact
            label="Open bills"
            value={
              centre.openBills.length
                ? centre.openBills.map((b) => `${b.number} ${b.status}`).join("; ")
                : "None"
            }
          />
        </dl>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
