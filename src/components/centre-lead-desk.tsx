import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { leadCopy, type LeadCopy } from "@/lib/centre-lead-copy";
import {
  CENTRE_LEAD_STAGES,
  LEAD_SOURCES,
  LOST_REASONS,
  filterCentreLeads,
  type CentreLeadStage,
} from "@/lib/centre-leads";
import { providerNavSearch } from "@/lib/desk-nav";
import { localePath } from "@/lib/locale-path";
import {
  addCentreLead,
  addCentreLeadNote,
  assignCentreLead,
  createCentreApiKey,
  revokeCentreApiKey,
  saveCentreLeadSettings,
  saveCentreWebhook,
  setCentreLeadStage,
} from "@/lib/server/centre-leads";
import { useCopy } from "@/lib/use-copy";

type Centre = { id: string; name: string };
type Lead = {
  id: string;
  stage: string;
  stageLocked: boolean;
  lostReason: string | null;
  source: string;
  ageGroup: string | null;
  desiredStart: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  childLabel: string | null;
  assignedTo: string | null;
  lastActivityAt: string;
  autoRule: string | null;
  noteText: string;
};
type Note = { id: string; leadId: string; body: string; createdAt: string };
type History = { leadId: string; fromStage: string | null; toStage: string; ruleId: string; automatic: boolean; at: string };
type KeyRow = { id: string; name: string; prefix: string; scopes: string[]; revokedAt: string | null; lastUsedAt: string | null };
type Report = {
  byStage: Record<string, number>;
  conversion: { inquiryToTour: number | null; tourToApplication: number | null; applicationToEnrolment: number | null };
  medianDays: Record<string, number | null>;
  lostReasons: { reason: string; count: number }[];
};

export type CentreLeadPageData = {
  enabled: boolean;
  hidden?: boolean;
  needsCentre?: boolean;
  denied?: boolean;
  centres?: Centre[];
  daycareId?: string;
  daycareName?: string;
  canWrite?: boolean;
  canKeys?: boolean;
  apiOn?: boolean;
  staleDays?: number;
  staff?: { id: string; name: string }[];
  leads?: Lead[];
  notes?: Note[];
  history?: History[];
  report?: Report;
  keys?: KeyRow[];
  webhook?: { url: string; enabled: boolean } | null;
};

const inputClass = "ke-input mt-1 w-full";

export function CentreLeadDesk({ initial }: { initial: CentreLeadPageData }) {
  const { locale } = useCopy();
  const copy = leadCopy(locale);
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const leadsTo = (pathname.startsWith("/fr") ? "/fr/provider/leads" : "/provider/leads") as "/provider/leads";
  const data = initial;
  const [view, setView] = useState<"list" | "board" | "report">("list");
  const [stage, setStage] = useState("");
  const [age, setAge] = useState("");
  const [start, setStart] = useState("");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const leads = data.leads ?? [];
  const filtered = useMemo(
    () => filterCentreLeads(data.leads ?? [], { stage, ageGroup: age, desiredStart: start, source, query: debounced }),
    [data.leads, stage, age, start, source, debounced],
  );
  const open = leads.find((lead) => lead.id === openId) ?? null;

  async function refresh() {
    await router.invalidate();
  }

  async function run(task: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await task();
      if (!result.ok) setError(copy.fail);
      else {
        setMessage(okText);
        await refresh();
      }
    } catch {
      setError(copy.fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeskShell
      desk="daycare"
      active="leads"
      wide
      headingMode="aside"
      onSelect={(id) => {
        if (id === "leads") return;
        void router.navigate({ to: "/provider", search: providerNavSearch(id) });
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{copy.eyebrow}</p>
        <h1 className="mt-1 font-display text-[clamp(1.6rem,4vw,2.2rem)] leading-tight">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-base text-muted">{data.enabled ? copy.lead : copy.offBody}</p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-3 text-sm text-fg">
            {message}
          </p>
        ) : null}
        {!data.enabled ? <HomeLink label={copy.home} /> : null}
        {data.hidden ? <p className="mt-4">{copy.hidden}</p> : null}
        {data.denied ? (
          <p className="mt-4">
            {copy.denied} <HomeLink label={copy.home} />
          </p>
        ) : null}
        {data.needsCentre && !data.denied ? (
          <section className="mt-6">
            <h2 className="font-display text-xl">{copy.pickTitle}</h2>
            <p className="mt-2 max-w-xl text-muted">{copy.pickBody}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {(data.centres ?? []).map((centre) => (
                <li key={centre.id}>
                  <Link
                    to={leadsTo}
                    search={{ daycareId: centre.id }}
                    className="inline-flex min-h-11 w-full items-center rounded-2xl bg-surface px-4 py-3 text-left shadow-card ring-1 ring-slate-200/80 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:ring-white/15"
                  >
                    {centre.name || copy.openCentre}
                  </Link>
                </li>
              ))}
            </ul>
            {(data.centres ?? []).length === 0 ? <HomeLink label={copy.home} /> : null}
          </section>
        ) : null}
        {data.daycareId ? (
          <Workspace
            copy={copy}
            data={data}
            view={view}
            setView={setView}
            stage={stage}
            setStage={setStage}
            age={age}
            setAge={setAge}
            start={start}
            setStart={setStart}
            source={source}
            setSource={setSource}
            query={query}
            setQuery={setQuery}
            filtered={filtered}
            open={open}
            setOpenId={setOpenId}
            adding={adding}
            setAdding={setAdding}
            busy={busy}
            locale={locale}
            token={token}
            secret={secret}
            setToken={setToken}
            setSecret={setSecret}
            onSave={run}
            setError={setError}
            setMessage={setMessage}
          />
        ) : null}
      </div>
    </DeskShell>
  );
}

function HomeLink({ label }: { label: string }) {
  return (
    <p className="mt-4">
      <Link to="/provider" search={{ desk: "today" }} className="font-medium text-primary underline-offset-2 hover:underline">
        {label}
      </Link>
    </p>
  );
}

function Workspace(props: {
  copy: LeadCopy;
  data: CentreLeadPageData;
  view: "list" | "board" | "report";
  setView: (view: "list" | "board" | "report") => void;
  stage: string;
  setStage: (value: string) => void;
  age: string;
  setAge: (value: string) => void;
  start: string;
  setStart: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  filtered: Lead[];
  open: Lead | null;
  setOpenId: (id: string | null) => void;
  adding: boolean;
  setAdding: (value: boolean) => void;
  busy: boolean;
  locale: string;
  token: string | null;
  secret: string | null;
  setToken: (value: string | null) => void;
  setSecret: (value: string | null) => void;
  onSave: (task: () => Promise<{ ok: boolean; error?: string }>, okText: string) => Promise<void>;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
}) {
  const { copy, data } = props;
  const primaryIsSave = Boolean(props.open);
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted">{copy.next}</p>
      <p className="text-sm text-muted">{copy.quiet}</p>
      <div className="flex flex-wrap items-center gap-2">
        {(["list", "board", "report"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={props.view === id}
            className="min-h-11 rounded-full px-4 text-sm ring-1 ring-slate-200/80 touch-manipulation aria-pressed:bg-primary aria-pressed:text-primary-fg"
            onClick={() => props.setView(id)}
          >
            {id === "list" ? copy.list : id === "board" ? copy.board : copy.report}
          </button>
        ))}
        {data.canWrite && !primaryIsSave && !props.adding ? (
          <Button type="button" className="ml-auto" onClick={() => props.setAdding(true)}>
            {copy.add}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">
          {copy.search}
          <input className={inputClass} value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
        </label>
        <Select label={copy.stage} value={props.stage} onChange={props.setStage} options={[["", copy.all], ...CENTRE_LEAD_STAGES.map((id) => [id, copy.stages[id]] as [string, string])]} />
        <Select
          label={copy.age}
          value={props.age}
          onChange={props.setAge}
          options={[
            ["", copy.all],
            ["infant", copy.infant],
            ["toddler", copy.toddler],
            ["preschool", copy.preschool],
            ["any", copy.anyAge],
          ]}
        />
        <label className="text-sm font-medium">
          {copy.start}
          <input className={inputClass} placeholder="2026-09" value={props.start} onChange={(event) => props.setStart(event.target.value)} />
        </label>
        <Select label={copy.source} value={props.source} onChange={props.setSource} options={[["", copy.all], ...LEAD_SOURCES.map((id) => [id, copy.sources[id]] as [string, string])]} />
      </div>
      {props.adding && data.canWrite ? (
        <AddForm
          copy={copy}
          busy={props.busy}
          onCancel={() => props.setAdding(false)}
          onSubmit={(fields) =>
            props.onSave(async () => addCentreLead({ data: { daycareId: data.daycareId, ...fields } }), copy.saved)
          }
        />
      ) : null}
      {props.view === "report" && data.report ? <ReportView copy={copy} report={data.report} /> : null}
      {props.view !== "report" && props.filtered.length === 0 ? (
        <p className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          {copy.empty} {copy.emptyNext}
        </p>
      ) : null}
      {props.view === "list" ? (
        <ul className="flex flex-col gap-2">
          {props.filtered.map((lead) => (
            <li key={lead.id}>
              <LeadButton copy={copy} lead={lead} onOpen={() => props.setOpenId(lead.id)} />
            </li>
          ))}
        </ul>
      ) : null}
      {props.view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2" data-ke="lead-kanban">
          {CENTRE_LEAD_STAGES.map((id) => (
            <section key={id} className="w-[min(100%,16rem)] shrink-0 rounded-xl bg-surface p-2 ring-1 ring-border">
              <h2 className="px-2 py-2 text-sm font-semibold">{copy.stages[id]}</h2>
              <ul className="flex flex-col gap-2">
                {props.filtered
                  .filter((lead) => lead.stage === id)
                  .map((lead) => (
                    <li key={lead.id}>
                      <LeadButton copy={copy} lead={lead} onOpen={() => props.setOpenId(lead.id)} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {props.open && data.canWrite ? (
        <LeadEditor
          copy={copy}
          lead={props.open}
          notes={(data.notes ?? []).filter((note) => note.leadId === props.open?.id)}
          history={(data.history ?? []).filter((row) => row.leadId === props.open?.id)}
          staff={data.staff ?? []}
          busy={props.busy}
          onClose={() => props.setOpenId(null)}
          onSave={props.onSave}
          daycareId={data.daycareId || ""}
        />
      ) : null}
      {data.canKeys ? (
        <ApiPanel
          copy={copy}
          keys={data.keys ?? []}
          webhook={data.webhook ?? null}
          staleDays={data.staleDays ?? 3}
          daycareId={data.daycareId || ""}
          locale={props.locale}
          token={props.token}
          secret={props.secret}
          busy={props.busy}
          setToken={props.setToken}
          setSecret={props.setSecret}
          setError={props.setError}
          setMessage={props.setMessage}
          onDone={() => props.onSave(async () => ({ ok: true }), copy.saved)}
        />
      ) : null}
      <StaleForm copy={copy} days={data.staleDays ?? 3} daycareId={data.daycareId || ""} canWrite={Boolean(data.canWrite)} onSave={props.onSave} />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, text]) => (
          <option key={id || "all"} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function LeadButton({ copy, lead, onOpen }: { copy: LeadCopy; lead: Lead; onOpen: () => void }) {
  const stage = (CENTRE_LEAD_STAGES as readonly string[]).includes(lead.stage) ? copy.stages[lead.stage as CentreLeadStage] : lead.stage;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full flex-col items-start gap-1 rounded-xl bg-surface p-4 text-left shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="font-semibold">{lead.contactName || lead.contactEmail || copy.stages.inquiry}</span>
      <span className="text-sm text-muted">
        {stage}
        {lead.childLabel ? ` · ${lead.childLabel}` : ""}
        {lead.ageGroup ? ` · ${lead.ageGroup}` : ""}
        {lead.desiredStart ? ` · ${lead.desiredStart}` : ""}
        {lead.source ? ` · ${copy.sources[lead.source as keyof typeof copy.sources] || lead.source}` : ""}
      </span>
    </button>
  );
}

function AddForm({
  copy,
  busy,
  onCancel,
  onSubmit,
}: {
  copy: LeadCopy;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fields: { contactName: string; contactEmail: string; contactPhone: string; childLabel: string; ageGroup: string; desiredStart: string }) => void;
}) {
  const [fields, setFields] = useState({ contactName: "", contactEmail: "", contactPhone: "", childLabel: "", ageGroup: "", desiredStart: "" });
  return (
    <form
      className="grid gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200/80 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(fields);
      }}
    >
      <Field label={copy.name} value={fields.contactName} onChange={(contactName) => setFields({ ...fields, contactName })} />
      <Field label={copy.email} value={fields.contactEmail} onChange={(contactEmail) => setFields({ ...fields, contactEmail })} type="email" />
      <Field label={copy.phone} value={fields.contactPhone} onChange={(contactPhone) => setFields({ ...fields, contactPhone })} />
      <Field label={copy.child} value={fields.childLabel} onChange={(childLabel) => setFields({ ...fields, childLabel })} />
      <Field label={copy.start} value={fields.desiredStart} onChange={(desiredStart) => setFields({ ...fields, desiredStart })} placeholder="2026-09" />
      <div className="flex items-end gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {copy.add}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input className={inputClass} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function LeadEditor({
  copy,
  lead,
  notes,
  history,
  staff,
  busy,
  daycareId,
  onClose,
  onSave,
}: {
  copy: LeadCopy;
  lead: Lead;
  notes: Note[];
  history: History[];
  staff: { id: string; name: string }[];
  busy: boolean;
  daycareId: string;
  onClose: () => void;
  onSave: (task: () => Promise<{ ok: boolean; error?: string }>, okText: string) => Promise<void>;
}) {
  const [stage, setStage] = useState(lead.stage);
  const [reason, setReason] = useState(lead.lostReason || "");
  const [note, setNote] = useState("");
  const [staffId, setStaffId] = useState(lead.assignedTo || "");
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200/80">
      <h2 className="font-display text-xl">{lead.contactName || lead.contactEmail}</h2>
      {lead.stageLocked ? <p className="mt-2 text-sm text-muted">{copy.locked}</p> : null}
      {lead.autoRule ? <p className="mt-1 text-sm text-muted">{copy.automatic}: {lead.autoRule}</p> : null}
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(
            () => setCentreLeadStage({ data: { daycareId, leadId: lead.id, stage, lostReason: reason } }),
            copy.saved,
          );
        }}
      >
        <Select label={copy.stage} value={stage} onChange={setStage} options={CENTRE_LEAD_STAGES.map((id) => [id, copy.stages[id]])} />
        {stage === "lost" ? (
          <Select label={copy.lost} value={reason} onChange={setReason} options={LOST_REASONS.map((id) => [id, copy.reasons[id]])} />
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {copy.saveStep}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void onSave(() => setCentreLeadStage({ data: { daycareId, leadId: lead.id, unlock: true, stage: lead.stage } }), copy.saved)}
          >
            {copy.follow}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {copy.cancel}
          </Button>
        </div>
      </form>
      <label className="mt-4 block text-sm font-medium">
        {copy.assign}
        <select
          className={inputClass}
          value={staffId}
          onChange={(event) => {
            const next = event.target.value;
            setStaffId(next);
            void onSave(() => assignCentreLead({ data: { daycareId, leadId: lead.id, staffUserId: next } }), copy.saved);
          }}
        >
          <option value="">{copy.nobody}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(() => addCentreLeadNote({ data: { daycareId, leadId: lead.id, body: note } }), copy.saved).then(() => setNote(""));
        }}
      >
        <label className="block text-sm font-medium">
          {copy.note}
          <textarea className={`${inputClass} min-h-24`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="submit" variant="secondary" className="mt-2" disabled={busy}>
          {copy.addNote}
        </Button>
      </form>
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((item) => (
          <li key={item.id} className="text-sm">
            {item.body}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-sm font-semibold">{copy.history}</h3>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
        {history.length === 0 ? <li>{copy.noneYet}</li> : null}
        {history.map((item, index) => (
          <li key={`${item.at}-${index}`}>
            {(item.automatic ? copy.automatic : copy.staff) + `: ${item.fromStage || copy.stages.inquiry} → ${item.toStage} (${item.ruleId})`}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportView({ copy, report }: { copy: LeadCopy; report: Report }) {
  const rates = [
    [copy.inquiryToTour, report.conversion.inquiryToTour],
    [copy.tourToApply, report.conversion.tourToApplication],
    [copy.applyToEnrol, report.conversion.applicationToEnrolment],
  ] as const;
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200/80">
      <h2 className="font-display text-xl">{copy.reportTitle}</h2>
      <p className="mt-2 text-sm text-muted">{copy.reportLead}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {CENTRE_LEAD_STAGES.map((stage) => (
          <li key={stage} className="rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
            {copy.stages[stage]}: {report.byStage[stage] ?? 0}
            {report.medianDays[stage] != null ? ` · ${copy.median} ${report.medianDays[stage]}` : ""}
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {rates.map(([label, value]) => (
          <li key={label}>
            {label}: {value == null ? copy.noneYet : `${Math.round(value * 1000) / 10}%`}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-sm font-semibold">{copy.lost}</h3>
      <ul className="mt-2 text-sm">
        {report.lostReasons.length === 0 ? <li>{copy.noneYet}</li> : null}
        {report.lostReasons.map((row) => (
          <li key={row.reason}>
            {(copy.reasons as Record<string, string>)[row.reason] || row.reason}: {row.count}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StaleForm({
  copy,
  days,
  daycareId,
  canWrite,
  onSave,
}: {
  copy: LeadCopy;
  days: number;
  daycareId: string;
  canWrite: boolean;
  onSave: (task: () => Promise<{ ok: boolean; error?: string }>, okText: string) => Promise<void>;
}) {
  const [value, setValue] = useState(String(days));
  if (!canWrite) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(() => saveCentreLeadSettings({ data: { daycareId, staleDays: Number(value) } }), copy.saved);
      }}
    >
      <label className="text-sm font-medium">
        {copy.stale}
        <input className={inputClass} inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary">
        {copy.saveStale}
      </Button>
    </form>
  );
}

function ApiPanel(props: {
  copy: LeadCopy;
  keys: KeyRow[];
  webhook: { url: string; enabled: boolean } | null;
  staleDays: number;
  daycareId: string;
  locale: string;
  token: string | null;
  secret: string | null;
  busy: boolean;
  setToken: (value: string | null) => void;
  setSecret: (value: string | null) => void;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
  onDone: () => Promise<void>;
}) {
  const { copy } = props;
  const [name, setName] = useState("");
  const [url, setUrl] = useState(props.webhook?.url || "");
  const [enabled, setEnabled] = useState(props.webhook?.enabled === true);
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-slate-200/80">
      <h2 className="font-display text-xl">{copy.apiTitle}</h2>
      <p className="mt-2 text-sm text-muted">{copy.apiLead}</p>
      <p className="mt-2 text-sm">{copy.consent}</p>
      <p className="mt-2">
        <a href={localePath("/daycare-api", props.locale)} className="text-primary underline-offset-2 hover:underline">
          {copy.apiDocs}
        </a>
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void createCentreApiKey({ data: { daycareId: props.daycareId, name, write: true } }).then((result) => {
            if (result.ok && "token" in result) props.setToken(result.token);
            else props.setError(copy.fail);
          });
        }}
      >
        <Field label={copy.keyName} value={name} onChange={setName} />
        <Button type="submit" variant="secondary" disabled={props.busy}>
          {copy.createKey}
        </Button>
      </form>
      {props.token ? (
        <p className="mt-3 text-sm">
          {copy.copyKey}
          <input className={inputClass} readOnly value={props.token} aria-label={copy.copyKey} />
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {props.keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center gap-2">
            <span>
              {key.name} · {key.prefix} · {key.revokedAt ? copy.revoked : key.lastUsedAt ? copy.lastUsed : copy.neverUsed}
            </span>
            {!key.revokedAt ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  void revokeCentreApiKey({ data: { daycareId: props.daycareId, keyId: key.id } }).then(() => props.onDone())
                }
              >
                {copy.revoke}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void saveCentreWebhook({ data: { daycareId: props.daycareId, url, enabled } }).then((result) => {
            if (!result.ok) props.setError(copy.fail);
            else {
              if ("secret" in result && result.secret) props.setSecret(result.secret);
              props.setMessage(copy.saved);
            }
          });
        }}
      >
        <h3 className="text-sm font-semibold">{copy.webhook}</h3>
        <Field label={copy.webhookUrl} value={url} onChange={setUrl} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          {copy.webhookOn}
        </label>
        <Button type="submit" variant="secondary">
          {copy.webhookSave}
        </Button>
      </form>
      {props.secret ? (
        <p className="mt-3 text-sm">
          {copy.webhookSecret}
          <input className={inputClass} readOnly value={props.secret} aria-label={copy.webhookSecret} />
        </p>
      ) : null}
    </section>
  );
}
