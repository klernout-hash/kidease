import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  createSupportCase,
  listSupportCases,
  searchSupportCentres,
  searchSupportPeople,
} from "@/lib/server/support";
import {
  SUPPORT_CASE_STATUSES,
  SUPPORT_CASE_TYPES,
  SUPPORT_INBOX_EMAIL,
  SUPPORT_PRIORITIES,
  supportStatusLabel,
  supportTypeLabel,
  type SupportCase,
  type SupportCaseStatus,
  type SupportCaseType,
  type SupportPriority,
} from "@/lib/support";

type Tab = "inbox" | "new";
type Scope = "all" | "mine" | "unassigned";

export function SupportDesk({ initialTab = "inbox" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [status, setStatus] = useState<SupportCaseStatus | "all">("all");
  const [type, setType] = useState<SupportCaseType | "all">("all");
  const [scope, setScope] = useState<Scope>("all");
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const data = await listSupportCases({ data: { status, type, scope } });
      setCases(data.cases);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load cases");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab !== "inbox") return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter-driven
  }, [tab, status, type, scope]);

  return (
    <DeskShell desk="support" active={tab} onSelect={(id) => setTab(id === "new" ? "new" : "inbox")}>
      <p className="text-sm text-muted">
        Case inbox is {SUPPORT_INBOX_EMAIL}. Refunds are a billing case type on that inbox, not a
        separate mailbox.
      </p>
      {tab === "new" ? (
        <NewCaseForm
          onCreated={() => {
            setTab("inbox");
            void refresh();
          }}
        />
      ) : (
        <Inbox
          cases={cases}
          busy={busy}
          status={status}
          type={type}
          scope={scope}
          onStatus={setStatus}
          onType={setType}
          onScope={setScope}
          onNew={() => setTab("new")}
        />
      )}
    </DeskShell>
  );
}

function Inbox({
  cases,
  busy,
  status,
  type,
  scope,
  onStatus,
  onType,
  onScope,
  onNew,
}: {
  cases: SupportCase[];
  busy: boolean;
  status: SupportCaseStatus | "all";
  type: SupportCaseType | "all";
  scope: Scope;
  onStatus: (v: SupportCaseStatus | "all") => void;
  onType: (v: SupportCaseType | "all") => void;
  onScope: (v: Scope) => void;
  onNew: () => void;
}) {
  const openish = useMemo(
    () => cases.filter((c) => c.status !== "resolved" && c.status !== "closed").length,
    [cases],
  );

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          className="h-10 rounded-full bg-surface px-3 text-sm ring-1 ring-border"
          value={status}
          onChange={(e) => onStatus(e.target.value as SupportCaseStatus | "all")}
        >
          <option value="all">All statuses</option>
          {SUPPORT_CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {supportStatusLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-full bg-surface px-3 text-sm ring-1 ring-border"
          value={type}
          onChange={(e) => onType(e.target.value as SupportCaseType | "all")}
        >
          <option value="all">All types</option>
          {SUPPORT_CASE_TYPES.map((s) => (
            <option key={s} value={s}>
              {supportTypeLabel(s)}
            </option>
          ))}
        </select>
        {(
          [
            ["all", "All"],
            ["mine", "Mine"],
            ["unassigned", "Unassigned"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onScope(id)}
            className={`h-10 rounded-full px-3 text-sm ${
              scope === id ? "bg-primary text-primary-fg" : "bg-surface ring-1 ring-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">
        {busy ? "Loading…" : `${cases.length} in this filter · ${openish} still open`}
      </p>
      {cases.length === 0 && !busy ? (
        <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          <EmptyState
            title="No cases"
            body="Open a case when a parent or centre needs help."
            action="New case"
            onAction={onNew}
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {cases.map((c) => (
            <li key={c.id} className="border-b border-border last:border-0">
              <Link to="/support/$caseId" params={{ caseId: c.id }} className="block px-4 py-3 hover:bg-surface-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{c.subject}</p>
                  <p className="text-xs text-subtle">{supportStatusLabel(c.status)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {supportTypeLabel(c.type)}
                  {c.parentName || c.parentEmail ? ` · ${c.parentName || c.parentEmail}` : ""}
                  {c.centreName ? ` · ${c.centreName}` : ""}
                  {c.assigneeName ? ` · ${c.assigneeName}` : " · Unassigned"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCaseForm({ onCreated }: { onCreated: () => void }) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<SupportCaseType>("other");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [parentQ, setParentQ] = useState("");
  const [parentId, setParentId] = useState("");
  const [centreQ, setCentreQ] = useState("");
  const [centreId, setCentreId] = useState("");
  const [people, setPeople] = useState<Array<{ userId: string; name: string | null; email: string | null }>>([]);
  const [centres, setCentres] = useState<Array<{ id: string; name: string; city: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (parentQ.trim().length < 2) {
      setPeople([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchSupportPeople({ data: parentQ }).then(setPeople).catch(() => setPeople([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [parentQ]);

  useEffect(() => {
    if (centreQ.trim().length < 2) {
      setCentres([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchSupportCentres({ data: centreQ }).then(setCentres).catch(() => setCentres([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [centreQ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createSupportCase({
        data: {
          subject,
          type,
          priority,
          parentUserId: parentId || null,
          centreId: centreId || null,
        },
      });
      toast.success("Case opened");
      onCreated();
      window.location.assign(`/support/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open case");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 max-w-xl space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Subject
        <input
          required
          minLength={3}
          className="ke-input mt-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Type
          <select
            className="ke-input mt-1"
            value={type}
            onChange={(e) => setType(e.target.value as SupportCaseType)}
          >
            {SUPPORT_CASE_TYPES.map((s) => (
              <option key={s} value={s}>
                {supportTypeLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Priority
          <select
            className="ke-input mt-1"
            value={priority}
            onChange={(e) => setPriority(e.target.value as SupportPriority)}
          >
            {SUPPORT_PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Parent (optional)
        <input
          className="ke-input mt-1"
          placeholder="Search name or email"
          value={parentQ}
          onChange={(e) => {
            setParentQ(e.target.value);
            setParentId("");
          }}
        />
      </label>
      {people.length ? (
        <ul className="rounded-md ring-1 ring-border">
          {people.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setParentId(p.userId);
                  setParentQ(p.email || p.name || p.userId);
                  setPeople([]);
                }}
              >
                {p.name || "Unnamed"} · {p.email || p.userId}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block text-sm font-medium">
        Centre (optional)
        <input
          className="ke-input mt-1"
          placeholder="Search centre name or city"
          value={centreQ}
          onChange={(e) => {
            setCentreQ(e.target.value);
            setCentreId("");
          }}
        />
      </label>
      {centres.length ? (
        <ul className="rounded-md ring-1 ring-border">
          {centres.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setCentreId(c.id);
                  setCentreQ(c.city ? `${c.name} · ${c.city}` : c.name);
                  setCentres([]);
                }}
              >
                {c.name}
                {c.city ? ` · ${c.city}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" disabled={busy}>
        Open case
      </Button>
    </form>
  );
}
