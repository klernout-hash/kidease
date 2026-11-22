import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatCad } from "@/lib/payroll/money.ts";
import { payCopy, statusLabel, varianceWords, type PayCopy } from "@/lib/payroll/copy.ts";
import type { Deadline } from "@/lib/payroll/deadlines.ts";
import type { MonthBreakdown } from "@/lib/payroll/remittance.ts";
import { invoiceJournal, stripeBalance } from "@/lib/payroll/books.ts";
import { postEntry, type JournalEntry } from "@/lib/payroll/ledger.ts";
import { extraTaxTooltip } from "@/lib/payroll/extra-tax.ts";

const TOUR_KEY = "ke-pay-tour";

function money(cents: number, locale: "en" | "fr") {
  return formatCad(cents, locale);
}

function WhatsThis({ copy, text }: { copy: PayCopy; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline touch-manipulation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {copy.whatsThis}
      </button>
      {open ? <span className="max-w-prose text-sm text-muted">{text}</span> : null}
    </span>
  );
}

function Progress({ copy, done }: { copy: PayCopy; done: number }) {
  const steps = [copy.stepHours, copy.stepPay, copy.stepAside, copy.stepSend];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={copy.progress}>
      {steps.map((label, index) => (
        <li key={label} className="min-w-0">
          <span className={`block h-2 rounded-full ${index < done ? "bg-ok" : "bg-border"}`} />
          <span className="mt-1 block text-xs text-muted">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function toneClass(tone: Deadline["tone"]): string {
  if (tone === "red") return "border-danger bg-danger/10 text-fg";
  if (tone === "amber") return "border-warn bg-[#f8efe3] text-fg";
  if (tone === "green") return "border-ok bg-ok/10 text-fg";
  return "border-border bg-surface text-fg";
}

function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border"
        data-ke="pay-search"
      />
    </label>
  );
}

function Fold({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl bg-surface ring-1 ring-border">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between px-4 text-left font-medium touch-manipulation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="text-sm text-muted">{open ? "–" : count ?? "+"}</span>
      </button>
      {open ? <div className="space-y-2 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function PayrollHome({ locale, onNext }: { locale: "en" | "fr"; onNext?: () => void }) {
  const home = sampleHome(locale);
  const { copy } = home;
  const [tour, setTour] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_KEY) !== "1") setTour(true);
    } catch {
      setTour(true);
    }
  }, []);
  const tourSteps = [
    [copy.tour1, copy.tour1Body],
    [copy.tour2, copy.tour2Body],
    [copy.tour3, copy.tour3Body],
    [copy.tour4, copy.tour4Body],
  ];
  function closeTour() {
    try {
      window.localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
    setTour(false);
  }
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="payroll-home">
      <p className="text-sm font-medium text-primary">{copy.brand}</p>
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.homeTitle}</h1>
      <p className="text-base text-muted">{copy.homeLead}</p>
      <p className="text-sm text-muted">{copy.sample}</p>
      <article className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-border">
        <p className="text-sm font-medium">{copy.doThis}</p>
        <Progress copy={copy} done={home.progress} />
        <Button type="button" size="lg" variant={home.reds > 0 ? "danger" : "primary"} className="w-full" data-ke="do-next" onClick={onNext}>
          {home.button}
          {home.reds > 0 ? (
            <span className="ml-2 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-sm text-danger">
              {home.reds}
            </span>
          ) : null}
        </Button>
        <p className="text-sm">{home.buttonDetail}</p>
        <WhatsThis copy={copy} text={copy.officialPay} />
      </article>
      <article className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="who-here">
        <h2 className="font-display text-xl">{copy.whoHere}</h2>
        {home.onShift.length === 0 ? <p className="mt-2 text-sm text-muted">{copy.nobody}</p> : null}
        <ul className="mt-2 space-y-2">
          {home.onShift.map((person) => (
            <li key={person.name} className="flex min-h-11 items-center justify-between text-base">
              <span>{person.name}</span>
              <span className="text-muted">{person.since}</span>
            </li>
          ))}
        </ul>
      </article>
      <PayFolds locale={locale} />
      <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-primary" onClick={() => { setStep(0); setTour(true); }}>
        {copy.showAgain}
      </button>
      {tour ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-fg/40 p-4 sm:place-items-center" role="dialog" aria-modal="true" data-ke="pay-tour">
          <div className="w-full max-w-md rounded-2xl bg-surface p-5">
            <p className="text-sm text-muted">{step + 1} / 4</p>
            <h2 className="mt-1 font-display text-2xl">{tourSteps[step][0]}</h2>
            <p className="mt-2 text-base">{tourSteps[step][1]}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={closeTour}>{copy.tourSkip}</Button>
              <Button
                type="button"
                onClick={() => {
                  if (step === 3) closeTour();
                  else setStep(step + 1);
                }}
              >
                {step === 3 ? copy.tourDone : copy.tourNext}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const PEOPLE = ["Amira S.", "Leo Chen", "Noor Ali", "Sam Patel"];

function PayFolds({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const match = (text: string) => !needle || text.toLowerCase().includes(needle);
  const people = PEOPLE.filter((name) => match(name));
  return (
    <div className="space-y-2" data-ke="pay-folds">
      <SearchBox label={copy.search} value={query} onChange={setQuery} />
      {needle && people.length === 0 ? <p className="text-sm text-muted">{copy.nothingFound}</p> : null}
      <Fold title={copy.setup}>
        <p className="text-sm">{copy.payQuestion}</p>
      </Fold>
      <Fold title={copy.alertsTitle} count={3}>
        <p className="text-sm">{copy.approveHours}</p>
      </Fold>
      <Fold title={copy.people} count={people.length}>
        {people.slice(0, 3).map((name) => (
          <p key={name} className="min-h-11 text-base">{name}</p>
        ))}
      </Fold>
      <Fold title={copy.records} count={2}>
        <p className="text-sm">{copy.government}</p>
      </Fold>
      <Fold title={copy.help}>
        <p className="text-sm">{copy.officialGov}</p>
        <p className="text-sm">{copy.officialTax}</p>
      </Fold>
    </div>
  );
}

export function PaySetup({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const [hourly, setHourly] = useState(true);
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="pay-setup">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.setup}</h1>
      <p className="text-base">{copy.payQuestion}</p>
      <p className="text-sm text-muted">{copy.sample}</p>
      <label className="block text-sm font-medium">
        {copy.people}
        <select className="mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border" defaultValue="Amira S.">
          {PEOPLE.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={hourly ? "primary" : "secondary"} onClick={() => setHourly(true)}>{copy.hourly}</Button>
        <Button type="button" variant={hourly ? "secondary" : "primary"} onClick={() => setHourly(false)}>{copy.salary}</Button>
      </div>
      <label className="block text-sm font-medium">
        {hourly ? copy.hourlyRate : copy.salary}
        <input inputMode="decimal" defaultValue={hourly ? "22.50" : "46800"} className="mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border" />
      </label>
      <Fold title={copy.moreChoices}>
        <p className="text-sm">{copy.extraPitch}</p>
        <label className="block text-sm font-medium">
          {copy.extraLabel}
          <input inputMode="decimal" defaultValue="20.00" className="mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border" data-ke="extra-tax" />
        </label>
        <WhatsThis copy={copy} text="CRA form TD1, additional tax to be deducted. Checked 2026-11-22. https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1.html" />
      </Fold>
      <Button type="button" size="lg" className="w-full" data-ke="save-pay">{copy.savePerson}</Button>
      <p className="text-sm text-muted">{copy.fixBank}</p>
    </section>
  );
}

export function DeadlineAlerts({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const home = sampleHome(locale);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const reds = home.deadlines.filter((item) => item.tone === "red");
  const shown = reds.filter((item) => {
    const title = locale === "fr" ? item.titleFr : item.titleEn;
    return !needle || title.toLowerCase().includes(needle);
  }).slice(0, 2);
  return (
    <section className="mx-auto w-full max-w-xl space-y-3" data-ke="deadline-alerts">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.alertsTitle}</h1>
      <p className="text-sm text-muted">{copy.sample}</p>
      <SearchBox label={copy.search} value={query} onChange={setQuery} />
      {shown.length === 0 ? <p className="text-sm text-muted">{copy.nothingFound}</p> : null}
      <ul className="space-y-2">
        {shown.map((item) => (
          <li key={item.id} className={`rounded-2xl border p-4 ${toneClass(item.tone)}`}>
            <p className="font-medium">{locale === "fr" ? item.titleFr : item.titleEn}</p>
            <p className="text-sm text-muted">{item.due ? `${copy.due} ${item.due}` : item.citation}</p>
            <Button type="button" variant="danger" className="mt-3 w-full" data-ke="fix-now">{copy.fixNow}</Button>
          </li>
        ))}
      </ul>
      <Fold title={copy.earlier} count={home.deadlines.length}>
        <p className="text-sm text-muted">{copy.dates}</p>
      </Fold>
    </section>
  );
}

export function DeadlineList({ locale, items }: { locale: "en" | "fr"; items: readonly Deadline[] }) {
  const copy = payCopy(locale);
  return (
    <ul className="space-y-2" data-ke="deadlines">
      {items.filter((item) => item.tone !== "green").map((item) => (
        <li key={item.id} className={`rounded-2xl border p-4 ${toneClass(item.tone)}`}>
          <p className="font-medium">{locale === "fr" ? item.titleFr : item.titleEn}</p>
          <p className="text-sm text-muted">{item.due ? `${copy.due} ${item.due}` : item.citation}</p>
          {item.tone === "red" ? (
            <Button type="button" variant="danger" className="mt-3 w-full" data-ke="fix-now">{copy.fixNow}</Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PayWizard({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const [step, setStep] = useState(0);
  const questions = [copy.wizardHours, copy.wizardPay, copy.wizardConfirm, copy.wizardDone];
  const actions = [copy.hoursYes, copy.payYes, copy.savePay, copy.setAside];
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="pay-wizard">
      <p className="text-sm text-muted">{step + 1} / 4</p>
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{questions[step]}</h1>
      <p className="text-base" data-ke="pay-sentence">{step === 0 ? copy.missed : sampleSentence(locale)}</p>
      {step === 1 ? <p className="text-sm" data-ke="extra-tax-stub">{copy.extraOnStub}: {money(2000, locale)}. {copy.extraPitch}</p> : null}
      <p className="text-sm text-muted">{copy.estimate}</p>
      <WhatsThis copy={copy} text={copy.officialTax} />
      {step === 2 ? <p className="text-sm">{copy.noMoney}</p> : null}
      {step === 3 ? <p className="text-sm">{copy.doneBody}</p> : null}
      <Button type="button" size="lg" className="w-full" data-ke="wizard-next" onClick={() => setStep(Math.min(3, step + 1))}>
        {actions[step]}
      </Button>
      {step > 0 ? (
        <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium" onClick={() => setStep(step - 1)}>
          {copy.back}
        </button>
      ) : null}
    </section>
  );
}

export function GovernmentJar({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const pack = sampleMonth(locale);
  const month = pack.months[0];
  const [open, setOpen] = useState(false);
  const short = Math.max(0, month.owedCents - month.setAsideCents);
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="government-jar">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.government}</h1>
      <p className="text-sm text-muted">{copy.partnerAccount}</p>
      <WhatsThis copy={copy} text={copy.officialGov} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Jar label={copy.owed} cents={month.owedCents} locale={locale} className="bg-[#f8efe3] text-warn" />
        <Jar label={copy.aside} cents={month.setAsideCents} locale={locale} className="bg-soft text-primary" />
        <Jar label={copy.sent} cents={month.sentCents} locale={locale} className="bg-ok/15 text-ok" />
      </div>
      <p className="text-base font-medium">
        {copy.month}: {money(month.owedCents, locale)}
      </p>
      <p className="text-sm">{month.due.date ? `${copy.due} ${month.due.date}` : copy.dates}</p>
      {month.alert ? (
        <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert" data-ke="jar-alert">
          {varianceWords({ locale, varianceCents: month.varianceCents, shortCents: short, money: (cents) => money(cents, locale), status: month.status })}
        </p>
      ) : null}
      <p className="text-sm" data-ke="jar-extra">{copy.extraOnStub}: {money(2000, locale)}. {extraTaxTooltip(locale, "cra")}</p>
      <Button type="button" variant="secondary" className="w-full" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? copy.hideParts : copy.seeParts}
      </Button>
      {open ? (
        <ul className="space-y-2">
          {month.buckets.map((bucket) => (
            <li key={bucket.code} className="rounded-xl bg-surface p-3 ring-1 ring-border">
              <p className="font-medium uppercase">{bucket.code}</p>
              <p className="text-sm">{bucket.sentence}</p>
              <p className="text-sm text-muted">{money(bucket.owedCents, locale)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Jar({ label, cents, locale, className }: { label: string; cents: number; locale: "en" | "fr"; className: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{money(cents, locale)}</p>
    </div>
  );
}

export function MonthTable({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const pack = sampleMonth(locale);
  return (
    <section className="mx-auto w-full max-w-xl space-y-3" data-ke="month-table">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.month}</h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <caption className="sr-only">{copy.government}</caption>
          <thead>
            <tr className="text-muted">
              <th className="py-2 pr-2 font-medium">{copy.month}</th>
              <th className="py-2 pr-2 font-medium">{copy.owed}</th>
              <th className="py-2 font-medium">{copy.dates}</th>
            </tr>
          </thead>
          <tbody>
            {pack.months.map((month) => {
              const short = Math.max(0, month.owedCents - month.setAsideCents);
              const words = varianceWords({
                locale,
                varianceCents: month.varianceCents,
                shortCents: short,
                money: (cents) => money(cents, locale),
                status: month.status,
              });
              return (
                <tr key={month.month} className="border-t border-border align-top">
                  <td className="py-3 pr-2">
                    <span className={`mr-2 inline-block size-3 rounded-full ${dot(month)}`} aria-hidden="true" />
                    {month.month}
                    <span className="mt-1 block text-muted">{statusLabel(month.status, copy)}</span>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-2">{money(month.owedCents, locale)}</td>
                  <td className="py-3">{words}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function dot(month: MonthBreakdown): string {
  if (month.status === "overdue" || month.status === "mismatch") return "bg-danger";
  if (month.status === "due_soon") return "bg-warn";
  return "bg-ok";
}

export function StaffShift({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const [inShift, setInShift] = useState(false);
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="staff-shift">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.checkIn}</h1>
      <p className="text-base text-muted">{copy.noRates}</p>
      <Button
        type="button"
        size="lg"
        className="h-20 w-full text-xl"
        data-ke="clock-button"
        onClick={() => setInShift((value) => !value)}
      >
        {inShift ? copy.checkOut : copy.checkIn}
      </Button>
      <h2 className="font-display text-xl">{copy.myHours}</h2>
      <p className="text-base">{inShift ? "8:02" : copy.nobody}</p>
      <form className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="extra-tax-request" onSubmit={(event) => event.preventDefault()}>
        <p className="text-base">{copy.extraPitch}</p>
        <label className="block text-sm font-medium">
          {copy.extraLabel}
          <input inputMode="decimal" defaultValue="20.00" className="mt-1 min-h-11 w-full rounded-xl bg-bg px-3 text-base ring-1 ring-border" />
        </label>
        <WhatsThis copy={copy} text={extraTaxTooltip(locale, "cra")} />
        <Button type="submit" size="lg" className="w-full">{copy.extraAsk}</Button>
        <p className="text-sm text-muted">{copy.extraWaiting}</p>
      </form>
    </section>
  );
}

function sampleBooks(): JournalEntry[] {
  const care = invoiceJournal({
    id: "care-1",
    daycareId: "sample-centre",
    amountCents: 120_000,
    kind: "care",
    province: "ON",
    at: "2026-11-01",
  });
  const extra = invoiceJournal({
    id: "extra-1",
    daycareId: "sample-centre",
    amountCents: 2_000,
    kind: "extra",
    province: "ON",
    at: "2026-11-02",
  });
  const wages: JournalEntry = {
    id: "wages-1",
    daycareId: "sample-centre",
    ledger: "books",
    memo: "Staff pay",
    at: "2026-11-15",
    lines: [
      { account: "wages", debitCents: 80_000, creditCents: 0 },
      { account: "net_wages_payable", debitCents: 0, creditCents: 80_000 },
    ],
  };
  return [care, extra, wages].reduce<JournalEntry[]>((rows, entry) => {
    const posted = postEntry(rows, entry);
    return posted.ok ? posted.entries : rows;
  }, []);
}

export function BooksSimple({ locale }: { locale: "en" | "fr" }) {
  const copy = payCopy(locale);
  const entries = sampleBooks();
  const fees = 120_000;
  const pay = 80_000;
  const tax = entries.flatMap((entry) => entry.lines).filter((line) => line.account === "gst_hst_payable").reduce((sum, line) => sum + line.creditCents, 0);
  return (
    <section className="mx-auto w-full max-w-xl space-y-4" data-ke="books-simple">
      <p className="text-sm text-muted">{copy.sample}</p>
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)]">{copy.booksTitle}</h1>
      <p className="text-base">{copy.booksLead}</p>
      <p className="text-sm text-muted">{copy.careExempt}</p>
      <WhatsThis copy={copy} text={copy.officialBooks} />
      <ul className="space-y-2">
        <li className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-4 ring-1 ring-border">
          <span>{locale === "fr" ? "Frais des parents" : "Parent fees"}</span>
          <span>{money(fees, locale)}</span>
        </li>
        <li className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-4 ring-1 ring-border">
          <span>{locale === "fr" ? "Paie du personnel" : "Staff pay"}</span>
          <span>{money(pay, locale)}</span>
        </li>
        <li className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-4 ring-1 ring-border">
          <span>{locale === "fr" ? "Il reste" : "Left over"}</span>
          <span>{money(fees - pay, locale)}</span>
        </li>
        <li className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-4 ring-1 ring-border">
          <span>{locale === "fr" ? "Taxe sur l'extra" : "Tax on the extra"}</span>
          <span>{money(tax, locale)}</span>
        </li>
        <li className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-4 ring-1 ring-border">
          <span>{locale === "fr" ? "Solde Stripe du centre" : "Centre Stripe balance"}</span>
          <span>{money(stripeBalance(entries, "sample-centre"), locale)}</span>
        </li>
      </ul>
      <p className="text-sm">{locale === "fr" ? "Les frais de garde n'ont pas de taxe. L'extra taxable a la TVH de l'Ontario." : "Care fees have no sales tax. The taxable extra has Ontario HST."}</p>
    </section>
  );
}

export function PayrollDesk({ locale, owner }: { locale: "en" | "fr"; owner: boolean }) {
  const copy = payCopy(locale);
  const [screen, setScreen] = useState<PayScreen>(owner ? "home" : "staff");
  if (!owner) {
    return (
      <section className="mx-auto w-full max-w-xl space-y-3" data-ke="payroll-denied">
        <h1 className="font-display text-2xl">{copy.homeTitle}</h1>
        <p>{copy.ownerOnly}</p>
        <StaffShift locale={locale} />
      </section>
    );
  }
  return (
    <div className="space-y-4">
      {screen !== "home" ? (
        <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-primary" onClick={() => setScreen("home")}>
          {copy.back}
        </button>
      ) : null}
      {screen === "home" ? <PayrollHome locale={locale} onNext={() => setScreen("wizard")} /> : null}
      {screen === "wizard" ? <PayWizard locale={locale} /> : null}
      {screen === "jar" ? <GovernmentJar locale={locale} /> : null}
      {screen === "books" ? <BooksSimple locale={locale} /> : null}
      {screen === "staff" ? <StaffShift locale={locale} /> : null}
      {screen === "home" ? (
        <div className="mx-auto flex w-full max-w-xl flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setScreen("jar")}>{copy.government}</Button>
          <Button type="button" variant="secondary" onClick={() => setScreen("month")}>{copy.month}</Button>
        </div>
      ) : null}
      {screen === "month" ? <MonthTable locale={locale} /> : null}
    </div>
  );
}

export function PayrollPreview({ locale, screen }: { locale: "en" | "fr"; screen: PayScreen }) {
  if (screen === "wizard") return <PayWizard locale={locale} />;
  if (screen === "jar") return <GovernmentJar locale={locale} />;
  if (screen === "month") return <MonthTable locale={locale} />;
  if (screen === "staff") return <StaffShift locale={locale} />;
  if (screen === "books") return <BooksSimple locale={locale} />;
  if (screen === "setup") return <PaySetup locale={locale} />;
  if (screen === "alerts") return <DeadlineAlerts locale={locale} />;
  return <PayrollHome locale={locale} />;
}
