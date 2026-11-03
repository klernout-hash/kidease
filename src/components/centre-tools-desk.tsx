import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ALLERGENS,
  CLEANING_TEMPLATE,
  DAYS,
  FOOD_GROUPS,
  MAINTENANCE_TEMPLATE,
  MEAL_SLOTS,
  OBS_DOMAINS,
  OBS_FOUNDATIONS,
  OBS_LEVELS,
  OFFLINE_KEY,
  agencyClaimCsv,
  attendanceBill,
  checklistProgress,
  enqueueTap,
  initials,
  menuAllergens,
  menuGaps,
  money,
  payrollCsv,
  payrollSummary,
  pdTotals,
  quickbooksCsv,
  replayQueue,
  type Bill,
  type CentreToolId,
  type MenuItem,
  type QueuedTap,
} from "@/lib/centre-tools";
import { centreToolsCopy, type CentreToolsCopy } from "@/lib/centre-tools-copy";
import { listCentreTools, saveCentreToolRecord } from "@/lib/server/centre-tools";
import { listDoorRoster, recordChildCheck } from "@/lib/server/child-checkin";
import { useCopy } from "@/lib/use-copy";

type Data = Awaited<ReturnType<typeof listCentreTools>>;
type Rec = Data["records"][number];

const field = "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-base";
const label = "block text-sm font-medium";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const pretty = (id: string) => id.replace(/_/g, " ");

export function CentreToolsDesk() {
  const { locale } = useCopy();
  const copy = centreToolsCopy(locale);
  const [data, setData] = useState<Data | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState<CentreToolId | "">("");

  const load = useCallback(() => {
    void listCentreTools({ data: { daycareId, month } })
      .then((next) => {
        setData(next);
        if (next.daycareId && next.daycareId !== daycareId) setDaycareId(next.daycareId);
        setTab((current) => (current && next.tools.includes(current) ? current : ((next.tools[0] as CentreToolId) ?? "")));
      })
      .catch(() => setData(null));
  }, [daycareId, month]);
  useEffect(load, [load]);

  const save = useCallback(
    async (kind: string, payload: Record<string, unknown>, bookingId = "") => {
      try {
        const res = await saveCentreToolRecord({ data: { daycareId, kind, bookingId, payload } });
        if (!res.ok) throw new Error("off");
        toast.success(copy.saved);
        load();
        return true;
      } catch {
        toast.error(copy.fail);
        return false;
      }
    },
    [daycareId, copy, load],
  );

  if (!data || !data.tools.length) {
    return (
      <section className="rounded-xl border p-5" data-testid="centre-tools-off">
        <h2 className="font-display text-2xl">{copy.offTitle}</h2>
        <p className="mt-2 text-base">{copy.offBody}</p>
      </section>
    );
  }
  const records = data.records;
  const props = { copy, data, records, save, month, setMonth };
  return (
    <section className="space-y-4" data-testid="centre-tools-desk">
      <div>
        <h2 className="font-display text-3xl">{copy.title}</h2>
        <p className="mt-1 text-base text-muted-foreground">{copy.lead}</p>
      </div>
      {data.centres.length > 1 ? (
        <label className={label}>
          {copy.centre}
          <select className={field} value={daycareId} onChange={(e) => setDaycareId(e.target.value)}>
            {data.centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2" role="tablist">
        {data.tools.map((id) => (
          <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? "primary" : "outline"} className="min-h-11" onClick={() => setTab(id as CentreToolId)}>
            {copy[id as keyof CentreToolsCopy]}
          </Button>
        ))}
      </div>
      <div className="rounded-xl border p-4">
        {tab === "meals" ? <MealsTool {...props} /> : null}
        {tab === "observations" ? <ObservationsTool {...props} /> : null}
        {tab === "pd" ? <PdTool {...props} /> : null}
        {tab === "maintenance" ? <ChecklistTool {...props} kind="maintenance" /> : null}
        {tab === "cleaning" ? <ChecklistTool {...props} kind="cleaning" /> : null}
        {tab === "quickbooks" ? <QuickbooksTool {...props} /> : null}
        {tab === "tap" ? <TapTool {...props} /> : null}
        {tab === "attendance" || tab === "subsidy" ? <BillingTool {...props} subsidy={tab === "subsidy"} /> : null}
        {tab === "payroll" ? <PayrollTool {...props} /> : null}
        {tab === "offline" ? <OfflineTool copy={copy} /> : null}
      </div>
    </section>
  );
}

type ToolProps = {
  copy: CentreToolsCopy;
  data: Data;
  records: Rec[];
  save: (kind: string, payload: Record<string, unknown>, bookingId?: string) => Promise<boolean>;
  month: string;
  setMonth: (m: string) => void;
};

function ChildPicker({ copy, data, value, onChange }: { copy: CentreToolsCopy; data: Data; value: string; onChange: (v: string) => void }) {
  return (
    <label className={label}>
      {copy.child}
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {data.roster.map((r) => (
          <option key={r.bookingId} value={r.bookingId}>{r.childName}</option>
        ))}
      </select>
    </label>
  );
}

function History({ copy, rows, render }: { copy: CentreToolsCopy; rows: Rec[]; render: (r: Rec) => string }) {
  if (!rows.length) return <p className="mt-4 text-sm text-muted-foreground">{copy.noRows}</p>;
  return (
    <ul className="mt-4 divide-y text-sm">
      {rows.slice(0, 20).map((r) => (
        <li key={r.id} className="py-2">{render(r)}</li>
      ))}
    </ul>
  );
}

function MealsTool({ copy, records, save }: ToolProps) {
  const [weekOf, setWeekOf] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<MenuItem[]>([]);
  const [note, setNote] = useState("");
  const cell = (day: string, slot: string) => items.find((i) => i.day === day && i.slot === slot);
  const setCell = (day: string, slot: string, patch: Partial<MenuItem>) =>
    setItems((prev) => {
      const rest = prev.filter((i) => !(i.day === day && i.slot === slot));
      const base = cell(day, slot) ?? { day, slot, food: "", groups: [], allergens: [] };
      return [...rest, { ...base, ...patch }];
    });
  const menu = { weekOf, items: items.filter((i) => i.food.trim()), allergyNote: note };
  const gaps = menuGaps(menu);
  return (
    <div data-testid="tool-meals">
      <h3 className="text-xl font-semibold">{copy.meals}</h3>
      <label className={label}>
        {copy.weekOf}
        <input type="date" className={field} value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
      </label>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[720px] text-sm">
          <thead>
            <tr>
              <th />
              {DAYS.map((d) => <th key={d} className="p-1 text-left capitalize">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {MEAL_SLOTS.map((slot) => (
              <tr key={slot}>
                <th className="p-1 text-left capitalize">{pretty(slot)}</th>
                {DAYS.map((day) => {
                  const c = cell(day, slot);
                  return (
                    <td key={day} className="p-1 align-top">
                      <input aria-label={`${copy.food} ${day} ${slot}`} className={field} value={c?.food || ""} onChange={(e) => setCell(day, slot, { food: e.target.value })} />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {FOOD_GROUPS.map((g) => (
                          <label key={g} className="text-xs">
                            <input type="checkbox" checked={c?.groups.includes(g) || false} onChange={(e) => setCell(day, slot, { groups: e.target.checked ? [...(c?.groups || []), g] : (c?.groups || []).filter((x) => x !== g) })} /> {pretty(g)}
                          </label>
                        ))}
                      </div>
                      <select aria-label={copy.allergens} className="mt-1 w-full text-xs" multiple value={c?.allergens || []} onChange={(e) => setCell(day, slot, { allergens: [...e.target.selectedOptions].map((o) => o.value) })}>
                        {ALLERGENS.map((a) => <option key={a} value={a}>{pretty(a)}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gaps.length ? (
        <p className="mt-2 text-sm text-amber-700" role="status">
          {copy.foodGuideGap}: {gaps.map((g) => `${g.day} (${g.missing.map(pretty).join(", ")})`).join("; ")}
        </p>
      ) : null}
      <p className="mt-2 text-sm">{copy.allergens}: {menuAllergens(menu).map(pretty).join(", ") || "—"}</p>
      <label className={`${label} mt-3`}>
        {copy.allergyNote}
        <textarea className={`${field} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button className="mt-3 min-h-11" onClick={() => void save("menu", { ...menu, allergens: menuAllergens(menu) })}>{copy.save}</Button>
      <History copy={copy} rows={records.filter((r) => r.kind === "menu")} render={(r) => `${copy.weekOf} ${String(r.payload.weekOf)} · ${(r.payload.items as unknown[] | undefined)?.length || 0}`} />
    </div>
  );
}

function ObservationsTool({ copy, data, records, save }: ToolProps) {
  const [bookingId, setBookingId] = useState("");
  const [domain, setDomain] = useState<string>(OBS_DOMAINS[0]);
  const [foundation, setFoundation] = useState<string>(OBS_FOUNDATIONS[0]);
  const [level, setLevel] = useState<string>("developing");
  const [note, setNote] = useState("");
  const date = new Date().toISOString().slice(0, 10);
  const names = new Map(data.roster.map((r) => [r.bookingId, r.childName]));
  return (
    <div data-testid="tool-observations">
      <h3 className="text-xl font-semibold">{copy.observations}</h3>
      <p className="text-sm text-muted-foreground">{copy.noPhotos}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChildPicker copy={copy} data={data} value={bookingId} onChange={setBookingId} />
        <label className={label}>{copy.domain}<select className={field} value={domain} onChange={(e) => setDomain(e.target.value)}>{OBS_DOMAINS.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}</select></label>
        <label className={label}>{copy.foundation}<select className={field} value={foundation} onChange={(e) => setFoundation(e.target.value)}>{OBS_FOUNDATIONS.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}</select></label>
        <label className={label}>{copy.level}<select className={field} value={level} onChange={(e) => setLevel(e.target.value)}>{OBS_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
      </div>
      <label className={`${label} mt-3`}>{copy.notes}<textarea className={`${field} min-h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Button className="mt-3 min-h-11" disabled={!bookingId || !note.trim()} onClick={() => void save("observation", { domain, foundation, level, note, date }, bookingId).then((ok) => ok && setNote(""))}>{copy.save}</Button>
      <History copy={copy} rows={records.filter((r) => r.kind === "observation")} render={(r) => `${names.get(r.bookingId || "") || copy.child} · ${pretty(String(r.payload.domain))} · ${String(r.payload.level)} — ${String(r.payload.note)}`} />
    </div>
  );
}

function PdTool({ copy, records, save }: ToolProps) {
  const [form, setForm] = useState({ staffName: "", course: "", provider: "", hours: "", date: new Date().toISOString().slice(0, 10) });
  const [target, setTarget] = useState("8");
  const rows = records.filter((r) => r.kind === "pd").map((r) => ({ staffName: String(r.payload.staffName), course: String(r.payload.course), provider: String(r.payload.provider), hours: Number(r.payload.hours) || 0, date: String(r.payload.date) }));
  const totals = pdTotals(rows, Number(target) || 0);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div data-testid="tool-pd">
      <h3 className="text-xl font-semibold">{copy.pd}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>{copy.staffName}<input className={field} value={form.staffName} onChange={set("staffName")} /></label>
        <label className={label}>{copy.course}<input className={field} value={form.course} onChange={set("course")} /></label>
        <label className={label}>{copy.provider}<input className={field} value={form.provider} onChange={set("provider")} /></label>
        <label className={label}>{copy.hours}<input type="number" min="0" step="0.5" className={field} value={form.hours} onChange={set("hours")} /></label>
        <label className={label}>{copy.date}<input type="date" className={field} value={form.date} onChange={set("date")} /></label>
        <label className={label}>{copy.targetHours}<input type="number" min="0" className={field} value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      </div>
      <Button className="mt-3 min-h-11" disabled={!form.staffName || !form.course || !Number(form.hours)} onClick={() => void save("pd", { ...form, hours: Number(form.hours) })}>{copy.save}</Button>
      <table className="mt-4 w-full text-sm">
        <thead><tr><th className="text-left">{copy.staffName}</th><th className="text-left">{copy.hours}</th><th className="text-left">{copy.targetHours}</th></tr></thead>
        <tbody>{totals.map((t) => <tr key={t.staffName}><td>{t.staffName}</td><td>{t.hours}</td><td>{t.remaining}</td></tr>)}</tbody>
      </table>
      <Button variant="outline" className="mt-3 min-h-11" disabled={!rows.length} onClick={() => download("staff-learning.csv", ["Staff,Course,OfferedBy,Hours,Date", ...rows.map((r) => [r.staffName, r.course, r.provider, r.hours, r.date].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n"))}>{copy.exportCsv}</Button>
    </div>
  );
}

function ChecklistTool({ copy, records, save, kind }: ToolProps & { kind: "maintenance" | "cleaning" }) {
  const template = kind === "maintenance" ? MAINTENANCE_TEMPLATE : CLEANING_TEMPLATE;
  const [done, setDone] = useState<string[]>([]);
  const [room, setRoom] = useState("");
  const [initialsText, setInitials] = useState("");
  const [asset, setAsset] = useState("");
  const run = { date: new Date().toISOString().slice(0, 10), done, initials: initialsText, room };
  const progress = checklistProgress(template, run);
  return (
    <div data-testid={`tool-${kind}`}>
      <h3 className="text-xl font-semibold">{copy[kind]}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>{copy.room}<input className={field} value={room} onChange={(e) => setRoom(e.target.value)} /></label>
        <label className={label}>{copy.initials}<input className={field} maxLength={6} value={initialsText} onChange={(e) => setInitials(e.target.value)} /></label>
      </div>
      <ul className="mt-3 space-y-2">
        {template.map((row) => (
          <li key={row.id}>
            <label className="flex min-h-11 items-center gap-3 text-base">
              <input type="checkbox" className="h-5 w-5" checked={done.includes(row.id)} onChange={(e) => setDone(e.target.checked ? [...done, row.id] : done.filter((x) => x !== row.id))} />
              <span className="capitalize">{pretty(row.id)}</span>
              <span className="text-xs text-muted-foreground">({row.every})</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">{copy.done}: {progress.done}/{progress.total}</p>
      {kind === "maintenance" ? (
        <label className={`${label} mt-3`}>{copy.asset}<input className={field} value={asset} onChange={(e) => setAsset(e.target.value)} /></label>
      ) : null}
      <Button className="mt-3 min-h-11" disabled={!initialsText.trim()} onClick={() => void save(kind, { ...run, asset }).then((ok) => ok && setDone([]))}>{copy.save}</Button>
      <History copy={copy} rows={records.filter((r) => r.kind === kind)} render={(r) => `${String(r.payload.date)} · ${String(r.payload.room || "")} · ${(r.payload.done as unknown[] | undefined)?.length || 0}/${template.length} · ${String(r.payload.initials)}`} />
    </div>
  );
}

function billsFromRecords(records: Rec[]): { bookingId: string; bill: Bill }[] {
  return records.filter((r) => r.kind === "bill" && r.bookingId).map((r) => ({ bookingId: r.bookingId!, bill: r.payload as unknown as Bill }));
}

function QuickbooksTool({ copy, data, records }: ToolProps) {
  const names = new Map(data.roster.map((r) => [r.bookingId, r.childName]));
  const rows = billsFromRecords(records).map(({ bookingId, bill }, i) => ({
    number: `KE-${bill.month}-${i + 1}`,
    customer: `${names.get(bookingId) || "Family"} family`,
    date: `${bill.month}-01`,
    due: `${bill.month}-15`,
    item: "Child care",
    amountCents: bill.parentCents,
  }));
  return (
    <div data-testid="tool-quickbooks">
      <h3 className="text-xl font-semibold">{copy.quickbooks}</h3>
      <p className="mt-1 text-sm">{copy.quickbooksNote}</p>
      <p className="mt-2 text-sm">{rows.length} · {copy.billHistory}</p>
      <Button className="mt-3 min-h-11" disabled={!rows.length} onClick={() => download("kidease-quickbooks-invoices.csv", quickbooksCsv(rows))}>{copy.exportCsv}</Button>
    </div>
  );
}

function TapTool({ copy, data, records, save }: ToolProps) {
  const [bookingId, setBookingId] = useState("");
  const [amount, setAmount] = useState("");
  const cents = Math.round(Number(amount) * 100);
  return (
    <div data-testid="tool-tap">
      <h3 className="text-xl font-semibold">{copy.tap}</h3>
      <p className="mt-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="note" data-testid="tap-note">{data.terminalConfigured ? copy.tapNote : copy.tapSoon}</p>
      {data.terminalConfigured ? (<>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChildPicker copy={copy} data={data} value={bookingId} onChange={setBookingId} />
        <label className={label}>{copy.amount}<input type="number" min="1" step="0.01" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <Button className="mt-3 min-h-11" disabled={!bookingId || !(cents >= 100)} onClick={() => void save("tap_receipt", { amountCents: cents, method: "tap_to_pay_test", date: new Date().toISOString() }, bookingId)}>{copy.tapTest}</Button>
      </>) : null}
      <History copy={copy} rows={records.filter((r) => r.kind === "tap_receipt")} render={(r) => `${r.createdAt.slice(0, 10)} · $${money(Number(r.payload.amountCents) || 0)} · test`} />
    </div>
  );
}

function BillingTool({ copy, data, records, save, month, setMonth, subsidy }: ToolProps & { subsidy: boolean }) {
  const [bookingId, setBookingId] = useState("");
  const [fee, setFee] = useState("10");
  const [scheduled, setScheduled] = useState("20");
  const [chargeAbsent, setChargeAbsent] = useState(false);
  const [sick, setSick] = useState("0");
  const [pct, setPct] = useState("0");
  const [agency, setAgency] = useState("");
  const bill = useMemo(
    () =>
      attendanceBill({
        month,
        attendedDays: data.attendance[bookingId] || [],
        scheduledDays: Number(scheduled) || 0,
        dailyFeeCents: Math.round(Number(fee) * 100),
        chargeAbsent,
        sickDaysAllowed: Number(sick) || 0,
        subsidyPercent: subsidy ? Number(pct) || 0 : 0,
        agency: subsidy ? agency : "",
      }),
    [month, data.attendance, bookingId, scheduled, fee, chargeAbsent, sick, pct, agency, subsidy],
  );
  const names = new Map(data.roster.map((r) => [r.bookingId, r.childName]));
  const saved = billsFromRecords(records);
  return (
    <div data-testid={subsidy ? "tool-subsidy" : "tool-attendance"}>
      <h3 className="text-xl font-semibold">{subsidy ? copy.subsidy : copy.attendance}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChildPicker copy={copy} data={data} value={bookingId} onChange={setBookingId} />
        <label className={label}>{copy.month}<input type="month" className={field} value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label className={label}>{copy.dailyFee}<input type="number" min="0" step="0.01" className={field} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <label className={label}>{copy.scheduledDays}<input type="number" min="0" className={field} value={scheduled} onChange={(e) => setScheduled(e.target.value)} /></label>
        <label className={label}>{copy.sickDays}<input type="number" min="0" className={field} value={sick} onChange={(e) => setSick(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-5 w-5" checked={chargeAbsent} onChange={(e) => setChargeAbsent(e.target.checked)} />{copy.chargeAbsent}</label>
        {subsidy ? (
          <>
            <label className={label}>{copy.agency}<input className={field} value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
            <label className={label}>{copy.subsidyPct}<input type="number" min="0" max="100" className={field} value={pct} onChange={(e) => setPct(e.target.value)} /></label>
          </>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">{copy.attendance}</dt><dd className="text-lg font-semibold">{bill.attended}</dd></div>
        <div><dt className="text-muted-foreground">{copy.billed}</dt><dd className="text-lg font-semibold">{bill.billedDays}</dd></div>
        <div><dt className="text-muted-foreground">{copy.agencyShare}</dt><dd className="text-lg font-semibold">${money(bill.agencyCents)}</dd></div>
        <div><dt className="text-muted-foreground">{copy.parentShare}</dt><dd className="text-lg font-semibold">${money(bill.parentCents)}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={!bookingId} onClick={() => void save("bill", bill as unknown as Record<string, unknown>, bookingId)}>{copy.save}</Button>
        {subsidy ? (
          <Button variant="outline" className="min-h-11" disabled={!saved.length} onClick={() => download(`agency-claim-${month}.csv`, agencyClaimCsv(saved.filter((s) => s.bill.month === month).map((s) => ({ initials: initials(names.get(s.bookingId) || ""), bill: s.bill }))))}>{copy.exportCsv}</Button>
        ) : null}
      </div>
      <History copy={copy} rows={records.filter((r) => r.kind === "bill")} render={(r) => `${names.get(r.bookingId || "") || copy.child} · ${String(r.payload.month)} · ${copy.parentShare} $${money(Number(r.payload.parentCents) || 0)} · ${copy.agencyShare} $${money(Number(r.payload.agencyCents) || 0)}`} />
    </div>
  );
}

function PayrollTool({ copy }: ToolProps) {
  const [lines, setLines] = useState([{ staffName: "", hours: "", rate: "" }]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const pay = lines.filter((l) => l.staffName && Number(l.hours)).map((l) => ({ staffName: l.staffName, hours: Number(l.hours), rateCents: Math.round(Number(l.rate) * 100) }));
  const summary = payrollSummary(pay);
  return (
    <div data-testid="tool-payroll">
      <h3 className="text-xl font-semibold">{copy.payroll}</h3>
      <p className="mt-1 text-sm">{copy.payrollNote}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="date" aria-label="start" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" aria-label="end" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      {lines.map((line, i) => (
        <div key={i} className="mt-2 grid grid-cols-3 gap-2">
          <input aria-label={copy.staffName} placeholder={copy.staffName} className={field} value={line.staffName} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, staffName: e.target.value } : l)))} />
          <input aria-label={copy.hours} placeholder={copy.hours} type="number" className={field} value={line.hours} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, hours: e.target.value } : l)))} />
          <input aria-label={copy.rate} placeholder={copy.rate} type="number" className={field} value={line.rate} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, rate: e.target.value } : l)))} />
        </div>
      ))}
      <Button variant="outline" className="mt-2 min-h-11" onClick={() => setLines([...lines, { staffName: "", hours: "", rate: "" }])}>+</Button>
      <ul className="mt-3 text-sm">{summary.map((s) => <li key={s.staffName}>{s.staffName}: {s.hours} h · {copy.gross} ${money(s.grossCents)}</li>)}</ul>
      <Button className="mt-3 min-h-11" disabled={!pay.length} onClick={() => download("payroll-export.csv", payrollCsv(start, end, pay))}>{copy.exportCsv}</Button>
    </div>
  );
}

function readQueue(): QueuedTap[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function writeQueue(q: QueuedTap[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
}

export function OfflineTool({ copy }: { copy: CentreToolsCopy }) {
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof listDoorRoster>>["children"]>([]);
  const [queue, setQueue] = useState<QueuedTap[]>([]);
  const [online, setOnline] = useState(true);
  const refresh = useCallback(() => {
    void listDoorRoster()
      .then((r) => setRoster(r.children))
      .catch(() => undefined);
  }, []);
  const sync = useCallback(async () => {
    const result = await replayQueue(readQueue(), async (tap) => {
      try {
        const res = await recordChildCheck({ data: { bookingId: tap.bookingId, action: tap.action, pickupName: tap.pickupName, at: tap.at } });
        return res.ok;
      } catch (err) {
        // Already saved on the server: drop it from the queue.
        return err instanceof Error && /already saved|not enrolled/i.test(err.message);
      }
    });
    writeQueue(result.left);
    setQueue(result.left);
    if (result.sent) toast.success(`${copy.offlineSynced}: ${result.sent}`);
    refresh();
  }, [copy, refresh]);
  useEffect(() => {
    setQueue(readQueue());
    setOnline(navigator.onLine);
    refresh();
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (navigator.onLine) void sync();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh, sync]);
  const tap = (bookingId: string, action: "check_in" | "check_out", pickupName: string) => {
    const next = enqueueTap(readQueue(), { id: `${bookingId}-${Date.now()}`, bookingId, action, pickupName, at: new Date().toISOString() });
    writeQueue(next);
    setQueue(next);
    if (navigator.onLine) void sync();
  };
  return (
    <div data-testid="tool-offline">
      <h3 className="text-xl font-semibold">{copy.offline}</h3>
      <p className="mt-1 text-sm">{copy.offlineNote}</p>
      <p className="mt-2 text-sm font-semibold" role="status">{online ? "●" : "○"} {queue.length} {copy.offlineWaiting}</p>
      <ul className="mt-3 divide-y">
        {roster.map((child) => (
          <li key={child.bookingId} className="flex items-center justify-between gap-2 py-2">
            <span>{child.childName}</span>
            <Button className="min-h-11" onClick={() => tap(child.bookingId, child.next, child.pickups[0] || "")}>{child.next === "check_out" ? copy.pickup : copy.arrival}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
