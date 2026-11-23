import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";
import { downloadPdf } from "@/lib/earnings-pdf";
import { formsForProvince, type EmployeeFormCard } from "@/lib/payroll/employee-forms.ts";
import { payErrorWords, paydayCopy, type PaydayCopy } from "@/lib/payroll/payday-copy.ts";
import { claimSummary, provincialKind, type TaxAnswers } from "@/lib/payroll/tax-forms.ts";
import type { FormRow } from "@/lib/payroll/forms-store.ts";
import {
  payrollApproveForm,
  payrollFormPdf,
  payrollMyForms,
  payrollRevealBank,
  payrollReviewForms,
  payrollSubmitContact,
  payrollSubmitDeposit,
  payrollSubmitTaxForm,
} from "@/lib/server/payroll-forms";
import { payrollSubmitSlipDetails } from "@/lib/server/payroll-slips";

type Locale = "en" | "fr";

const INPUT = "mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border";
const LINK = "inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline touch-manipulation";

function errorText(error: unknown, locale: Locale): string {
  return payErrorWords(error instanceof Error ? error.message : "", locale);
}

function focusIn(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

function kindLabel(kind: string, copy: PaydayCopy): string {
  const key = `kind_${kind}` as keyof PaydayCopy;
  return copy[key] ?? kind;
}

function OfficialLink({ card, copy }: { card: EmployeeFormCard; copy: PaydayCopy }) {
  if (!card.officialUrl) return null;
  return (
    <a className={LINK} href={card.officialUrl} target="_blank" rel="noreferrer">
      {copy.officialVersion} · {card.officialName} · {copy.asOf} {card.asOf}
    </a>
  );
}

function StatusTag({ form, copy }: { form: FormRow | undefined; copy: PaydayCopy }) {
  if (!form) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${form.status === "approved" ? "bg-ok/15" : "bg-soft"}`}>
      {form.status === "approved" ? copy.approvedTag : copy.pending} · {form.savedOn}
    </span>
  );
}

/** Staff phone flow: TD1, provincial TD1 or TP-1015.3, deposit, emergency contact. */
export function MyTaxForms({ locale, daycareId }: { locale: Locale; daycareId: string }) {
  const copy = paydayCopy(locale);
  const [data, setData] = useState<Awaited<ReturnType<typeof payrollMyForms>> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void payrollMyForms({ data: { daycareId } })
      .then((row) => live && setData(row))
      .catch((err: unknown) => live && setError(errorText(err, locale)));
    return () => {
      live = false;
    };
  }, [daycareId, attempt, locale]);

  if (error) return <p className="mx-auto w-full max-w-xl rounded-xl bg-surface p-4 text-sm ring-1 ring-border">{error}</p>;
  if (!data) return <p className="mx-auto w-full max-w-xl text-sm text-muted">{copy.loading}</p>;
  if (!data.onPay) return <p className="mx-auto w-full max-w-xl rounded-xl bg-surface p-4 text-sm ring-1 ring-border">{copy.notOnPay}</p>;

  const cards = formsForProvince(data.province);
  const latest = (kind: string) => data.forms.find((form) => form.kind === kind);
  const reload = () => setAttempt((n) => n + 1);
  const taxKinds = ["td1_federal", provincialKind(data.province)];

  return (
    <section className="mx-auto w-full max-w-xl space-y-3" data-ke="my-tax-forms">
      <h2 className="font-display text-2xl">{copy.myForms}</h2>
      <p className="text-sm text-muted">{copy.myFormsLead}</p>
      {cards
        .filter((card) => taxKinds.includes(card.kind))
        .map((card) => (
          <TaxFormFold key={card.kind} locale={locale} copy={copy} daycareId={daycareId} card={card} form={latest(card.kind)} name={data.name} onSaved={reload} />
        ))}
      <DepositFold locale={locale} copy={copy} daycareId={daycareId} form={latest("deposit")} name={data.name} onSaved={reload} />
      <ContactFold locale={locale} copy={copy} daycareId={daycareId} form={latest("emergency")} onSaved={reload} />
      {data.slipsEnabled ? <SlipDetailsFold locale={locale} copy={copy} daycareId={daycareId} form={latest("slip_info")} province={data.province} onSaved={reload} /> : null}
    </section>
  );
}

function Fold({ title, tag, children }: { title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <details className="rounded-2xl bg-surface ring-1 ring-border">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 font-medium">
        <span>{title}</span>
        {tag}
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function TaxFormFold({
  locale,
  copy,
  daycareId,
  card,
  form,
  name,
  onSaved,
}: {
  locale: Locale;
  copy: PaydayCopy;
  daycareId: string;
  card: EmployeeFormCard;
  form: FormRow | undefined;
  name: string;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"basic" | "claim" | "zero">(form?.tax?.mode ?? "basic");
  const [claim, setClaim] = useState(form?.tax?.claimCents ? (form.tax.claimCents / 100).toFixed(2) : "");
  const [signed, setSigned] = useState(name);
  const [certified, setCertified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      await payrollSubmitTaxForm({ data: { daycareId, kind: card.kind, mode, claimDollars: claim, signedName: signed, certified } });
      setMessage(copy.sentWaiting);
      setCertified(false);
      onSaved();
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Fold title={locale === "fr" ? card.titleFr : card.titleEn} tag={<StatusTag form={form} copy={copy} />}>
      {form?.tax ? <p className="text-sm">{claimSummary(form.tax, locale)}</p> : null}
      <fieldset className="space-y-1">
        <legend className="sr-only">{card.officialName}</legend>
        {(
          [
            ["basic", copy.claimBasic],
            ["claim", copy.claimTotal],
            ["zero", copy.claimZero],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-start gap-3 text-sm">
            <input type="radio" className="mt-1 size-5" name={`mode-${card.kind}`} checked={mode === value} onChange={() => setMode(value)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {mode === "claim" ? (
        <label className="block text-sm font-medium">
          {copy.totalClaim}
          <input inputMode="decimal" className={INPUT} value={claim} onFocus={focusIn} onChange={(event) => setClaim(event.target.value)} />
        </label>
      ) : null}
      <label className="block text-sm font-medium">
        {copy.signName}
        <input className={INPUT} value={signed} autoComplete="name" onFocus={focusIn} onChange={(event) => setSigned(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-5" checked={certified} onChange={(event) => setCertified(event.target.checked)} />
        <span>{copy.certify}</span>
      </label>
      <OfficialLink card={card} copy={copy} />
      <Button type="button" className="w-full" disabled={busy || !certified || signed.trim().length < 2} onClick={() => void send()}>
        {copy.send}
      </Button>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </Fold>
  );
}

function DepositFold({ locale, copy, daycareId, form, name, onSaved }: { locale: Locale; copy: PaydayCopy; daycareId: string; form: FormRow | undefined; name: string; onSaved: () => void }) {
  const [institution, setInstitution] = useState("");
  const [transit, setTransit] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      await payrollSubmitDeposit({ data: { daycareId, institution, transit, account, signedName: name } });
      setInstitution("");
      setTransit("");
      setAccount("");
      setMessage(copy.sentWaiting);
      onSaved();
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Fold title={copy.kind_deposit} tag={<StatusTag form={form} copy={copy} />}>
      {form?.bankLast4 ? (
        <p className="text-sm">
          {copy.last4} {form.bankLast4}
        </p>
      ) : null}
      <p className="text-sm text-muted">{copy.bankSafe}</p>
      <label className="block text-sm font-medium">
        {copy.institution}
        <input inputMode="numeric" autoComplete="off" className={INPUT} value={institution} maxLength={3} onFocus={focusIn} onChange={(event) => setInstitution(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        {copy.transit}
        <input inputMode="numeric" autoComplete="off" className={INPUT} value={transit} maxLength={5} onFocus={focusIn} onChange={(event) => setTransit(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        {copy.account}
        <input inputMode="numeric" autoComplete="off" className={INPUT} value={account} maxLength={12} onFocus={focusIn} onChange={(event) => setAccount(event.target.value)} />
      </label>
      <Button type="button" className="w-full" disabled={busy || !institution || !transit || !account} onClick={() => void send()}>
        {copy.send}
      </Button>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </Fold>
  );
}

function ContactFold({ locale, copy, daycareId, form, onSaved }: { locale: Locale; copy: PaydayCopy; daycareId: string; form: FormRow | undefined; onSaved: () => void }) {
  const [contactName, setContactName] = useState(form?.contact?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(form?.contact?.contactPhone ?? "");
  const [relation, setRelation] = useState(form?.contact?.relation ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      await payrollSubmitContact({ data: { daycareId, contactName, contactPhone, relation } });
      setMessage(copy.sentWaiting);
      onSaved();
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Fold title={copy.kind_emergency} tag={<StatusTag form={form} copy={copy} />}>
      <label className="block text-sm font-medium">
        {copy.contactName}
        <input className={INPUT} value={contactName} onFocus={focusIn} onChange={(event) => setContactName(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        {copy.contactPhone}
        <input inputMode="tel" autoComplete="tel" className={INPUT} value={contactPhone} onFocus={focusIn} onChange={(event) => setContactPhone(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        {copy.relation}
        <input className={INPUT} value={relation} onFocus={focusIn} onChange={(event) => setRelation(event.target.value)} />
      </label>
      <Button type="button" className="w-full" disabled={busy || !contactName || !contactPhone} onClick={() => void send()}>
        {copy.send}
      </Button>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </Fold>
  );
}

/** Legal name, address, and SIN for year-end slips. The SIN is sealed; only the last 3 digits show. */
function SlipDetailsFold({ locale, copy, daycareId, form, province, onSaved }: { locale: Locale; copy: PaydayCopy; daycareId: string; form: FormRow | undefined; province: string; onSaved: () => void }) {
  const [fields, setFields] = useState({ firstName: "", lastName: "", initial: "", sin: "", addrLine: "", city: "", provCd: province, postalCd: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => setFields({ ...fields, [key]: event.target.value });

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      await payrollSubmitSlipDetails({ data: { daycareId, ...fields } });
      setFields({ ...fields, sin: "" });
      setMessage(copy.sentWaiting);
      onSaved();
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  const rows: [keyof typeof fields, string, string][] = [
    ["firstName", copy.firstName, "given-name"],
    ["lastName", copy.lastName, "family-name"],
    ["initial", copy.initialLabel, "additional-name"],
    ["sin", copy.sin, "off"],
    ["addrLine", copy.slipsAddress, "street-address"],
    ["city", copy.slipsCity, "address-level2"],
    ["provCd", copy.slipsProv, "address-level1"],
    ["postalCd", copy.slipsPostal, "postal-code"],
  ];
  return (
    <Fold title={copy.slipDetails} tag={<StatusTag form={form} copy={copy} />}>
      <p className="text-sm text-muted">{copy.slipDetailsLead}</p>
      {form?.slip?.sinLast3 ? (
        <p className="text-sm">
          {copy.sinEnding} {form.slip.sinLast3}
        </p>
      ) : null}
      {rows.map(([key, label, auto]) => (
        <label key={key} className="block text-sm font-medium">
          {label}
          <input
            className={INPUT}
            value={fields[key]}
            autoComplete={auto}
            inputMode={key === "sin" ? "numeric" : undefined}
            maxLength={key === "initial" ? 1 : key === "provCd" ? 2 : key === "sin" ? 11 : 60}
            onFocus={focusIn}
            onChange={set(key)}
          />
        </label>
      ))}
      <Button type="button" className="w-full" disabled={busy || !fields.sin || !fields.lastName} onClick={() => void send()}>
        {copy.send}
      </Button>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </Fold>
  );
}

/** Owner and payroll editors: approve forms, print approved tax forms, and (owner only) open a bank number. */
export function FormsReview({ locale, daycareId, owner }: { locale: Locale; daycareId: string; owner: boolean }) {
  const copy = paydayCopy(locale);
  const reauth = useReauthPrompt();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<{ formId: string; text: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void payrollReviewForms({ data: { daycareId } })
      .then((row) => live && setForms(row.forms))
      .catch((err: unknown) => live && setMessage(errorText(err, locale)));
    return () => {
      live = false;
    };
  }, [daycareId, attempt, locale]);

  async function approve(formId: string) {
    setBusy(true);
    setMessage("");
    try {
      await payrollApproveForm({ data: { daycareId, formId } });
      setMessage(copy.saved);
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
      setAttempt((n) => n + 1);
    }
  }

  async function pdf(formId: string) {
    try {
      const file = await payrollFormPdf({ data: { daycareId, formId, locale } });
      downloadPdf(file.filename, file.lines);
    } catch (err) {
      setMessage(errorText(err, locale));
    }
  }

  async function reveal(formId: string) {
    setMessage("");
    try {
      const row = await withReauth(() => payrollRevealBank({ data: { daycareId, formId } }), reauth.prompt);
      setBank({ formId, text: `${row.institution} · ${row.transit} · ${row.account}` });
    } catch (err) {
      setMessage(errorText(err, locale));
    }
  }

  const summary = (form: FormRow) => {
    if (form.tax) return claimSummary(form.tax as TaxAnswers, locale);
    if (form.bankLast4) return `${copy.last4} ${form.bankLast4}`;
    if (form.contact) return `${form.contact.contactName} · ${form.contact.contactPhone}`;
    if (form.slip) return `${form.slip.name}${form.slip.sinLast3 ? ` · ${copy.sinEnding} ${form.slip.sinLast3}` : ""}`;
    return "";
  };

  return (
    <details className="rounded-2xl bg-surface ring-1 ring-border" data-ke="forms-review">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 font-medium">
        <span>{copy.forms}</span>
        {forms ? <span className="text-sm text-muted">{forms.filter((form) => form.status === "pending").length}</span> : null}
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-muted">{copy.formsLead}</p>
        {forms && forms.length === 0 ? <p className="text-sm">{copy.formsNone}</p> : null}
        <ul className="space-y-2">
          {(forms ?? []).map((form) => (
            <li key={form.id} className="space-y-1 rounded-xl p-3 ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {form.name} · {kindLabel(form.kind, copy)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${form.status === "approved" ? "bg-ok/15" : "bg-soft"}`}>
                  {form.status === "approved" ? copy.approvedTag : copy.pending} · {form.savedOn}
                </span>
              </div>
              <p className="text-sm">{summary(form)}</p>
              {bank?.formId === form.id ? (
                <p className="text-sm" role="status">
                  {bank.text} <span className="block text-xs text-muted">{copy.bankShown}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {form.status === "pending" ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void approve(form.id)}>
                    {copy.approveForm}
                  </Button>
                ) : null}
                {form.status === "approved" && form.tax ? (
                  <button type="button" className={LINK} onClick={() => void pdf(form.id)}>
                    {copy.pdf}
                  </button>
                ) : null}
                {owner && form.kind === "deposit" && form.bankLast4 && bank?.formId !== form.id ? (
                  <button type="button" className={LINK} onClick={() => void reveal(form.id)}>
                    {copy.showBank}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </div>
      {reauth.dialog}
    </details>
  );
}
