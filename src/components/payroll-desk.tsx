import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCad } from "@/lib/payroll/money.ts";
import { payCopy, statusLabel, varianceWords, type PayCopy } from "@/lib/payroll/copy.ts";
import type { Deadline } from "@/lib/payroll/deadlines.ts";
import type { MonthBreakdown } from "@/lib/payroll/remittance.ts";
import { invoiceJournal, stripeBalance } from "@/lib/payroll/books.ts";
import { postEntry, type JournalEntry } from "@/lib/payroll/ledger.ts";
import { sampleHome, sampleMonth, sampleSentence, type PayScreen } from "@/lib/payroll/view.ts";

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
      <DeadlineList locale={locale} items={home.deadlines} />
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
  return <PayrollHome locale={locale} />;
}
