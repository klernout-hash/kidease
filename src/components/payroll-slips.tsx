import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";
import { payErrorWords, paydayCopy, type PaydayCopy } from "@/lib/payroll/payday-copy.ts";
import type { SlipEmployer } from "@/lib/payroll/slip-xml.ts";
import { payrollSaveSlipEmployer, payrollSlipFiles, payrollSlipStatus } from "@/lib/server/payroll-slips";

type Locale = "en" | "fr";
type Status = Awaited<ReturnType<typeof payrollSlipStatus>>;

const INPUT = "mt-1 min-h-11 w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border";

function errorText(error: unknown, locale: Locale): string {
  return payErrorWords(error instanceof Error ? error.message : "", locale);
}

function download(name: string, text: string) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function word(copy: PaydayCopy, key: string): string {
  return copy[key as keyof PaydayCopy] ?? key;
}

/** Year-end slip files. Hidden unless FEATURE_PAYROLL_SLIP_XML is on. Owner downloads after a fresh sign-in. */
export function SlipsPanel({ locale, daycareId }: { locale: Locale; daycareId: string }) {
  const copy = paydayCopy(locale);
  const reauth = useReauthPrompt();
  const [taxYear, setTaxYear] = useState(() => new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0));
  const [status, setStatus] = useState<Status | null>(null);
  const [employer, setEmployer] = useState<SlipEmployer | null>(null);
  const [message, setMessage] = useState("");
  const [flagged, setFlagged] = useState<{ name: string; problem: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void payrollSlipStatus({ data: { daycareId, year: taxYear } })
      .then((row) => {
        if (!live) return;
        setStatus(row);
        if (row.enabled) setEmployer(row.employer);
      })
      .catch(() => live && setStatus({ enabled: false }));
    return () => {
      live = false;
    };
  }, [daycareId, taxYear, attempt]);

  if (!status || !status.enabled || !employer) return null;

  const set = (key: keyof SlipEmployer) => (event: { target: { value: string } }) => setEmployer({ ...employer, [key]: event.target.value });

  async function save() {
    if (!employer) return;
    setBusy(true);
    setMessage("");
    try {
      await payrollSaveSlipEmployer({ data: { daycareId, ...employer } });
      setMessage(copy.saved);
      setAttempt((n) => n + 1);
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const result = await withReauth(() => payrollSlipFiles({ data: { daycareId, year: taxYear, locale } }), reauth.prompt);
      for (const file of result.files) download(file.filename, file.xml);
      setFlagged([...result.flagged.t4, ...result.flagged.t4a, ...result.flagged.rl1]);
      setMessage(result.files.length ? copy.slipsLogged : copy.slipsNone);
    } catch (err) {
      setMessage(errorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  const fields: [keyof SlipEmployer, string][] = [
    ["name", copy.slipsName],
    ["businessNumber", copy.slipsBn],
    ["addrLine", copy.slipsAddress],
    ["city", copy.slipsCity],
    ["provCd", copy.slipsProv],
    ["postalCd", copy.slipsPostal],
    ["contactName", copy.slipsContact],
    ["contactPhone", copy.slipsPhone],
    ["contactEmail", copy.slipsEmail],
    ["rqId", copy.slipsRqId],
    ["rqNp", copy.slipsRqNp],
    ["rqCert", copy.slipsRqCert],
  ];
  const t4Problems = status.problems.t4;

  return (
    <details className="rounded-2xl bg-surface ring-1 ring-border" data-ke="pay-slips">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">{copy.slips}</summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-muted">{copy.slipsLead}</p>
        <p className="rounded-xl bg-soft p-3 text-sm" role="note">
          {copy.slipsCheck}
        </p>
        <label className="block text-sm font-medium">
          {copy.slipsYear}
          <input type="number" inputMode="numeric" className={INPUT} value={taxYear} min={2026} max={2100} onChange={(event) => setTaxYear(Number(event.target.value) || taxYear)} />
        </label>
        <details className="rounded-xl ring-1 ring-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{copy.slipsEmployer}</summary>
          <div className="space-y-2 px-3 pb-3">
            {fields.map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input className={INPUT} value={employer[key]} onChange={set(key)} />
              </label>
            ))}
            <label className="block text-sm">
              {copy.slipsDental}
              <select className={INPUT} value={employer.dentalCode} onChange={set("dentalCode")}>
                <option value="">—</option>
                {(["1", "2", "3", "4", "5"] as const).map((code) => (
                  <option key={code} value={code}>
                    {word(copy, `dental${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void save()}>
              {copy.slipsSave}
            </Button>
          </div>
        </details>
        {t4Problems.length ? (
          <p className="text-sm">
            {copy.slipsMissingEmployer} {t4Problems.map((code) => word(copy, `emp_${code}`)).join(", ")}
          </p>
        ) : null}
        {status.missing.length ? (
          <div className="text-sm">
            <p>{copy.slipsMissing}</p>
            <ul className="list-disc pl-5">
              {status.missing.map((row) => (
                <li key={row.personId}>{row.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {status.owner ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void run()} data-ke="slip-download">
            {copy.slipsDownload}
          </Button>
        ) : null}
        {flagged.length ? (
          <ul className="list-disc pl-5 text-sm">
            {flagged.map((row, index) => (
              <li key={`${row.name}-${index}`}>
                {row.name}: {word(copy, `problem_${row.problem}`)}
              </li>
            ))}
          </ul>
        ) : null}
        {message ? (
          <p className="text-sm" role="status">
            {message}
          </p>
        ) : null}
      </div>
      {reauth.dialog}
    </details>
  );
}
