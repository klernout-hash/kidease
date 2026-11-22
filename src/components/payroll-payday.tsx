import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadPdf } from "@/lib/earnings-pdf";
import { formatCad } from "@/lib/payroll/money.ts";
import { formatMinutes, type DayRow } from "@/lib/payroll/hours-adjust.ts";
import { buildPayCard, canApprove, searchPeople, SEARCHABLE_AFTER, type PayCard, type PayType } from "@/lib/payroll/pay-card.ts";
import { checkWords, defaultPeriod, payErrorWords, paydayCopy, type PaydayCopy } from "@/lib/payroll/payday-copy.ts";
import type { PayDesk } from "@/lib/payroll/pay-store.ts";
import type { PayYtd } from "@/lib/payroll/calculate.ts";
import {
  payrollAccountantPack,
  payrollApprove,
  payrollChange,
  payrollDesk,
  payrollFlagDay,
  payrollMyHours,
  payrollPeople,
} from "@/lib/server/payroll-pay";

type Locale = "en" | "fr";
type Period = { start: string; end: string; payDate: string };
type Person = { id: string; name: string; payType: PayType; province: string };
type Loaded = { desk: PayDesk; ytd: Partial<PayYtd> };

const INPUT = "mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border";
const LINK = "inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline touch-manipulation";

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function errorText(error: unknown, locale: Locale): string {
  return payErrorWords(error instanceof Error ? error.message : "", locale);
}

function focusIn(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

function clock(iso: string | null, locale: Locale): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString(locale === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date: string, locale: Locale): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function cardFrom(loaded: Loaded, period: Period, draft: { payType?: PayType; rateCents?: number; regularMinutes?: number }): PayCard {
  return buildPayCard({
    person: loaded.desk.person,
    period,
    days: loaded.desk.days,
    ytd: loaded.ytd,
    overrides: {
      payType: draft.payType ?? loaded.desk.payTypeOverride ?? undefined,
      rateCents: draft.rateCents ?? loaded.desk.rateOverride ?? undefined,
      regularMinutes: draft.regularMinutes,
    },
  });
}

/** Owner and payroll-editor screen. One main button: Approve pay. */
export function PayDay({ locale, daycareId }: { locale: Locale; daycareId: string }) {
  const copy = paydayCopy(locale);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(todayLocal()));
  const [people, setPeople] = useState<Person[] | null>(null);
  const [owner, setOwner] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [personId, setPersonId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    setPeople(null);
    setError("");
    void payrollPeople({ data: { daycareId } })
      .then((row) => {
        if (!live) return;
        setOwner(row.owner);
        setPeople(row.people);
      })
      .catch((err: unknown) => live && setError(errorText(err, locale)));
    return () => {
      live = false;
    };
  }, [daycareId, attempt, locale]);

  const shown = useMemo(() => searchPeople(people ?? [], query), [people, query]);
  const searchable = (people?.length ?? 0) > SEARCHABLE_AFTER;

  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="payday">
      <h2 className="font-display text-[clamp(1.5rem,5vw,2rem)]">{copy.title}</h2>
      <p className="text-base text-muted">{copy.lead}</p>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">{copy.period}</legend>
        {(["start", "end", "payDate"] as const).map((key) => (
          <label key={key} className="block text-sm">
            {key === "start" ? copy.from : key === "end" ? copy.to : copy.payDate}
            <input type="date" className={INPUT} value={period[key]} onFocus={focusIn} onChange={(event) => setPeriod({ ...period, [key]: event.target.value })} />
          </label>
        ))}
      </fieldset>
      {error ? (
        <div role="alert" className="space-y-2 rounded-xl bg-danger/10 p-3 text-sm">
          <p>{error}</p>
          <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            {copy.retry}
          </Button>
        </div>
      ) : null}
      {!people && !error ? <p className="text-sm text-muted">{copy.loading}</p> : null}
      {people && people.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm ring-1 ring-border">{copy.nobody}</p> : null}
      {people && people.length > 0 ? (
        <div className="space-y-2" data-ke="staff-picker">
          {searchable ? (
            <label className="block text-sm">
              <span className="sr-only">{copy.search}</span>
              <input className={INPUT} value={query} placeholder={copy.search} onFocus={focusIn} onChange={(event) => setQuery(event.target.value)} data-ke="staff-search" />
            </label>
          ) : null}
          {searchable && query && shown.length === 0 ? <p className="text-sm text-muted">{copy.noMatch}</p> : null}
          <label className="block text-sm font-medium">
            {copy.person}
            <select className={INPUT} value={personId} onChange={(event) => setPersonId(event.target.value)} data-ke="staff-select">
              <option value="">{copy.choose}</option>
              {shown.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {personId ? <PayCardPanel key={`${personId}-${period.start}-${period.end}-${period.payDate}`} locale={locale} copy={copy} daycareId={daycareId} employeeId={personId} period={period} /> : null}
      {people && people.length > 0 && owner ? <ApproveSection locale={locale} copy={copy} daycareId={daycareId} people={people} period={period} /> : null}
      {owner ? <AccountantPack locale={locale} copy={copy} daycareId={daycareId} /> : null}
    </section>
  );
}

function PayCardPanel({ locale, copy, daycareId, employeeId, period }: { locale: Locale; copy: PaydayCopy; daycareId: string; employeeId: string; period: Period }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [payType, setPayType] = useState<PayType | null>(null);
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    void payrollDesk({ data: { daycareId, employeeId, ...period } })
      .then((row) => {
        if (!live) return;
        setLoaded(row as unknown as Loaded);
        setPayType(null);
        setRate("");
        setReason("");
      })
      .catch((err: unknown) => live && setError(errorText(err, locale)));
    return () => {
      live = false;
    };
  }, [daycareId, employeeId, period, attempt, locale]);

  const draftRateCents = rate.trim() ? Math.round(Number(rate.replace(",", ".")) * 100) : undefined;
  const validRate = draftRateCents == null || (Number.isFinite(draftRateCents) && draftRateCents > 0);
  const card = useMemo(
    () => (loaded ? cardFrom(loaded, period, { payType: payType ?? undefined, rateCents: validRate ? draftRateCents : undefined }) : null),
    [loaded, period, payType, draftRateCents, validRate],
  );

  if (error) {
    return (
      <div role="alert" className="space-y-2 rounded-xl bg-danger/10 p-3 text-sm">
        <p>{error}</p>
        <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {copy.retry}
        </Button>
      </div>
    );
  }
  if (!loaded || !card) return <p className="text-sm text-muted">{copy.loading}</p>;

  const desk = loaded.desk;
  const savedType = desk.payTypeOverride ?? desk.person.payType;
  const savedRate = desk.rateOverride ?? desk.person.rateCents;
  const dirty = (payType != null && payType !== savedType) || (draftRateCents != null && draftRateCents !== savedRate);
  const money = (cents: number) => formatCad(cents, locale);
  const rateLabel = card.payType === "salary" ? copy.salary : card.payType === "contractor" ? copy.agreed : copy.rate;

  async function saveDraft() {
    setBusy(true);
    setNote("");
    try {
      if (payType != null && payType !== savedType) {
        await payrollChange({ data: { daycareId, employeeId, ...period, kind: "pay_type", value: payType, reason, expectedId: desk.payTypeToken } });
      }
      if (draftRateCents != null && draftRateCents !== savedRate) {
        await payrollChange({ data: { daycareId, employeeId, ...period, kind: "rate", value: (draftRateCents / 100).toFixed(2), reason, expectedId: desk.rateToken } });
      }
      setNote(copy.saved);
    } catch (err) {
      setNote(errorText(err, locale));
    } finally {
      setBusy(false);
      setAttempt((n) => n + 1);
    }
  }

  return (
    <article className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="pay-card">
      <h3 className="font-display text-xl">{desk.person.name}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {copy.payType}
          <select className={INPUT} value={payType ?? savedType} onChange={(event) => setPayType(event.target.value as PayType)} data-ke="pay-type">
            <option value="hourly">{copy.hourly}</option>
            <option value="salary">{copy.salaried}</option>
            <option value="contractor">{copy.contractor}</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          {rateLabel}
          <input
            inputMode="decimal"
            className={INPUT}
            value={rate}
            placeholder={(savedRate / 100).toFixed(2)}
            onFocus={focusIn}
            onChange={(event) => setRate(event.target.value)}
            aria-invalid={!validRate}
            data-ke="pay-rate"
          />
        </label>
      </div>
      {dirty ? (
        <div className="space-y-2 rounded-xl bg-soft p-3">
          <p className="text-sm">{copy.edited}</p>
          <label className="block text-sm font-medium">
            {copy.reason}
            <input className={INPUT} value={reason} placeholder={copy.reasonHint} onFocus={focusIn} onChange={(event) => setReason(event.target.value)} maxLength={200} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy || reason.trim().length < 3 || !validRate} onClick={() => void saveDraft()}>
              {copy.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setPayType(null); setRate(""); setReason(""); }}>
              {copy.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      {note ? <p className="text-sm" role="status">{note}</p> : null}
      <PayNumbers card={card} copy={copy} money={money} />
      <ChecksList card={card} copy={copy} locale={locale} />
      <DayList locale={locale} copy={copy} daycareId={daycareId} employeeId={employeeId} period={period} desk={desk} onSaved={() => setAttempt((n) => n + 1)} />
    </article>
  );
}

function PayNumbers({ card, copy, money }: { card: PayCard; copy: PaydayCopy; money: (cents: number) => string }) {
  const blocked = card.employee?.blocked ?? null;
  const rows: [string, string][] = [];
  if (card.payType === "hourly") {
    rows.push([copy.hours, formatMinutes(card.regularMinutes)]);
    if (card.overtimeMinutes > 0) rows.push([copy.overtime, formatMinutes(card.overtimeMinutes)]);
  }
  if (!blocked) {
    rows.push([copy.gross, money(card.grossCents)]);
    if (card.vacationCents) rows.push([copy.vacation, money(card.vacationCents)]);
    if (card.contractor?.salesTaxCents) rows.push([copy.salesTax, money(card.contractor.salesTaxCents)]);
    if (card.payType !== "contractor") rows.push([copy.deductions, money(card.deductionsCents)]);
  }
  return (
    <div className="space-y-2" data-ke="pay-numbers">
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <dt className="text-sm">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {blocked ? (
        <p className="rounded-xl bg-danger/10 p-3 text-sm" role="alert">{blocked}</p>
      ) : (
        <p className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-lg font-semibold">
          <span>{copy.net}</span>
          <span className="tabular-nums" data-ke="pay-net">{money(card.netCents)}</span>
        </p>
      )}
      {card.contractor ? <p className="text-sm text-muted">{copy.contractorNote}</p> : null}
      {card.employee?.edition ? (
        <p className="text-xs text-muted">
          {card.employee.edition} · {copy.asOf} {card.employee.asOf}
        </p>
      ) : null}
    </div>
  );
}

function ChecksList({ card, copy, locale }: { card: PayCard; copy: PaydayCopy; locale: Locale }) {
  return (
    <section className="space-y-2" data-ke="preflight">
      <h4 className="text-sm font-medium">{copy.checks}</h4>
      {card.checks.length === 0 ? <p className="text-sm text-muted">{copy.allClear}</p> : null}
      <ul className="space-y-2">
        {card.checks.map((check) => (
          <li key={`${check.code}-${check.detail ?? ""}`} className={`rounded-xl p-3 text-sm ${check.level === "stop" ? "bg-danger/10" : "bg-soft"}`}>
            <span>{checkWords(check.code, locale)}</span>
            {check.source ? (
              <a className={`${LINK} ml-1`} href={check.source} target="_blank" rel="noreferrer">
                {copy.source}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayList({
  locale,
  copy,
  daycareId,
  employeeId,
  period,
  desk,
  onSaved,
}: {
  locale: Locale;
  copy: PaydayCopy;
  daycareId: string;
  employeeId: string;
  period: Period;
  desk: PayDesk;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const worked = desk.days.filter((row) => row.minutes > 0 || row.checkIn || row.adjusted || row.flagged);

  async function send(row: DayRow, kind: "hours" | "reset") {
    setBusy(true);
    setMessage("");
    try {
      await payrollChange({
        data: { daycareId, employeeId, ...period, kind, workDate: row.date, value: hours, reason: kind === "reset" ? copy.reset : reason, expectedId: desk.dayTokens[row.date] ?? "" },
      });
      setEditing("");
      setHours("");
      setReason("");
      onSaved();
    } catch (err) {
      setMessage(errorText(err, locale));
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2" data-ke="pay-days">
      <h4 className="text-sm font-medium">{copy.hours}</h4>
      {message ? <p className="text-sm text-danger" role="alert">{message}</p> : null}
      <ul className="space-y-2">
        {(worked.length ? worked : desk.days).map((row) => (
          <li key={row.date} className="space-y-1 rounded-xl p-3 ring-1 ring-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{dayLabel(row.date, locale)}</span>
              <span className="tabular-nums">
                {formatMinutes(row.minutes)}
                {row.adjusted ? (
                  <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-xs">
                    {copy.adjusted} · {copy.was} {formatMinutes(row.originalMinutes ?? 0)}
                  </span>
                ) : null}
              </span>
            </div>
            <p className="text-sm text-muted">
              {row.checkIn ? `${copy.in} ${clock(row.checkIn, locale)} · ${copy.out} ${clock(row.checkOut, locale)}` : copy.noCheckIn}
            </p>
            {row.reason ? <p className="text-sm">“{row.reason}”</p> : null}
            {row.missedCheckout ? <p className="text-sm text-danger">{copy.missedOut}</p> : null}
            {row.flagged ? <p className="text-sm text-danger">{copy.flagged}{row.flagNote ? `: “${row.flagNote}”` : ""}</p> : null}
            {row.locked ? <p className="text-xs text-muted">{copy.locked}</p> : null}
            {editing === row.date ? (
              <div className="space-y-2 pt-1">
                <label className="block text-sm">
                  {copy.hours}
                  <input inputMode="decimal" className={INPUT} value={hours} placeholder="7.5" onFocus={focusIn} onChange={(event) => setHours(event.target.value)} />
                </label>
                <label className="block text-sm">
                  {copy.reason}
                  <input className={INPUT} value={reason} placeholder={copy.reasonHint} onFocus={focusIn} onChange={(event) => setReason(event.target.value)} maxLength={200} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy || !hours.trim() || reason.trim().length < 3} onClick={() => void send(row, "hours")}>
                    {copy.save}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing("")}>
                    {copy.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={LINK} onClick={() => { setEditing(row.date); setHours((row.minutes / 60).toFixed(2)); setReason(""); }}>
                  {copy.change}
                </button>
                {row.adjusted ? (
                  <button type="button" className={LINK} disabled={busy} onClick={() => void send(row, "reset")}>
                    {copy.reset}
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApproveSection({ locale, copy, daycareId, people, period }: { locale: Locale; copy: PaydayCopy; daycareId: string; people: Person[]; period: Period }) {
  const [cards, setCards] = useState<PayCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const money = (cents: number) => formatCad(cents, locale);

  async function preview() {
    setBusy(true);
    setMessage("");
    try {
      const rows = await Promise.all(people.map((person) => payrollDesk({ data: { daycareId, employeeId: person.id, ...period } })));
      setCards(rows.map((row) => cardFrom(row as unknown as Loaded, period, {})));
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setMessage("");
    try {
      await payrollApprove({ data: { daycareId, ...period } });
      setMessage(copy.approved);
      setCards(null);
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  const ready = cards != null && canApprove(cards);
  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="approve">
      <button type="button" className={LINK} disabled={busy} onClick={() => void preview()}>
        {copy.preview}
      </button>
      {cards ? (
        <ul className="space-y-2" data-ke="stub-preview">
          {cards.map((card) => (
            <li key={card.personId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span>{card.name}</span>
              <span className="tabular-nums">{card.employee?.blocked ? "—" : money(card.netCents)}</span>
              {card.checks.some((check) => check.level === "stop") ? <span className="w-full text-sm text-danger">{copy.blocked}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" size="lg" className="w-full" disabled={busy || !ready} onClick={() => void approve()} data-ke="approve-pay">
        {busy ? copy.approving : copy.approve}
      </Button>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </section>
  );
}

function download(name: string, text: string) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function AccountantPack({ locale, copy, daycareId }: { locale: Locale; copy: PaydayCopy; daycareId: string }) {
  const today = todayLocal();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const pack = await payrollAccountantPack({ data: { daycareId, from, to, locale } });
      if (pack.count === 0) {
        setMessage(copy.packEmpty);
        return;
      }
      for (const [name, text] of Object.entries(pack.files)) download(`kidease-${from}-${to}-${name}`, text);
      downloadPdf(`kidease-${from}-${to}-accountant-pack.pdf`, pack.pdfLines);
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl bg-surface ring-1 ring-border" data-ke="accountant-pack">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">{copy.pack}</summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-muted">{copy.packLead}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            {copy.from}
            <input type="date" className={INPUT} value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="block text-sm">
            {copy.to}
            <input type="date" className={INPUT} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void run()}>
          {copy.pack}
        </Button>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </div>
    </details>
  );
}

/** Staff: my own hours, any change and its reason, and "this day is wrong". */
export function MyPayHours({ locale, daycareId }: { locale: Locale; daycareId: string }) {
  const copy = paydayCopy(locale);
  const [period] = useState<Period>(() => defaultPeriod(todayLocal()));
  const [data, setData] = useState<Awaited<ReturnType<typeof payrollMyHours>> | null>(null);
  const [error, setError] = useState("");
  const [flagging, setFlagging] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    void payrollMyHours({ data: { daycareId, ...period } })
      .then((row) => live && setData(row))
      .catch((err: unknown) => {
        if (!live) return;
        const text = err instanceof Error ? err.message : "";
        setError(text.endsWith("own_hours") ? copy.notOnPay : errorText(err, locale));
      });
    return () => {
      live = false;
    };
  }, [daycareId, period, attempt, locale, copy.notOnPay]);

  async function flag(date: string) {
    if (!data) return;
    try {
      await payrollFlagDay({ data: { daycareId, employeeId: data.employeeId, workDate: date, note } });
      setMessage(copy.flagSaved);
      setFlagging("");
      setNote("");
      setAttempt((n) => n + 1);
    } catch (err) {
      setMessage(errorText(err, locale));
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-3" data-ke="my-pay-hours">
      <h2 className="font-display text-2xl">{copy.myHours}</h2>
      <p className="text-sm text-muted">{copy.myLead}</p>
      {error ? <p className="rounded-xl bg-surface p-4 text-sm ring-1 ring-border">{error}</p> : null}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      {!data && !error ? <p className="text-sm text-muted">{copy.loading}</p> : null}
      <ul className="space-y-2">
        {(data?.days ?? []).filter((row) => row.minutes > 0 || row.adjusted || row.flagged).map((row) => (
          <li key={row.date} className="space-y-1 rounded-xl bg-surface p-3 ring-1 ring-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{dayLabel(row.date, locale)}</span>
              <span className="tabular-nums">{formatMinutes(row.minutes)}</span>
            </div>
            {row.adjusted ? (
              <p className="text-sm">
                {copy.adjusted} · {copy.was} {formatMinutes(row.originalMinutes ?? 0)}
                {row.reason ? ` · “${row.reason}”` : ""}
              </p>
            ) : null}
            {row.missedCheckout ? <p className="text-sm text-danger">{copy.missedOut}</p> : null}
            {row.flagged ? <p className="text-sm text-muted">{copy.flagSaved}</p> : null}
            {flagging === row.date ? (
              <div className="space-y-2">
                <label className="block text-sm">
                  {copy.flagNote}
                  <input className={INPUT} value={note} onFocus={focusIn} onChange={(event) => setNote(event.target.value)} maxLength={200} />
                </label>
                <Button type="button" variant="secondary" disabled={note.trim().length < 3} onClick={() => void flag(row.date)}>
                  {copy.flagSend}
                </Button>
              </div>
            ) : row.flagged ? null : (
              <button type="button" className={LINK} onClick={() => setFlagging(row.date)}>
                {copy.flag}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
