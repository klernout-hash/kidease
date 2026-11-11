import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Button } from "@/components/ui/button";
import { featureCopy } from "@/lib/flagged-feature-copy";
import { localePath } from "@/lib/locale-path";
import { cadFromCents } from "@/lib/tax-receipts";
import { downloadTaxReceipt, listTaxReceipts } from "@/lib/server/tax-receipts";
import { useCopy } from "@/lib/use-copy";

type Group = Awaited<ReturnType<typeof listTaxReceipts>>["groups"][number];

function savePdf(filename: string, pdfBase64: string) {
  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TaxReceiptStudio({ desk = "parent" }: { desk?: "parent" | "centre" }) {
  const { locale } = useCopy();
  const { celebrate } = useSuccessConfirm();
  const copy = featureCopy(locale);
  const [hidden, setHidden] = useState(true);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [problem, setProblem] = useState<"" | "too-many" | "unavailable" | "none" | "saved">("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let live = true;
    void listTaxReceipts({ data: { desk } })
      .then((result) => {
        if (!live) return;
        if (!result.enabled) {
          setHidden(true);
          return;
        }
        setHidden(false);
        setYears(result.years);
        setYear(result.years[0] ?? new Date().getFullYear());
        setGroups(result.groups);
        if (!result.ok && result.reason === "too-many") setProblem("too-many");
        else if (!result.ok) setProblem("unavailable");
      })
      .catch(() => {
        if (live) setHidden(true);
      });
    return () => {
      live = false;
    };
  }, [desk]);

  if (hidden) return null;

  const shown = groups.filter((group) => group.year === year);
  const note =
    problem === "too-many"
      ? copy.taxTooMany
      : problem === "unavailable"
        ? copy.taxUnavailable
        : problem === "none"
          ? copy.taxNone
          : problem === "saved"
            ? copy.taxSaved
            : "";
  const help = (
    <Link to={localePath("/help", locale)} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
      {copy.help}
    </Link>
  );

  function download(group: Group, kind: "federal" | "rl24") {
    const key = `${group.daycareId}:${group.childId}:${kind}`;
    setBusy(key);
    setProblem("");
    void downloadTaxReceipt({
      data: {
        desk,
        year: group.year,
        daycareId: group.daycareId,
        childId: group.childId,
        parentUserId: group.parentUserId,
        kind,
      },
    })
      .then((result) => {
        if (!result.ok) {
          setProblem(result.reason === "too-many" ? "too-many" : result.reason === "unavailable" ? "unavailable" : "none");
          return;
        }
        savePdf(result.filename, result.pdfBase64);
        setProblem("saved");
        celebrate();
      })
      .catch(() => setProblem("unavailable"))
      .finally(() => setBusy(""));
  }

  return (
    <section className="w-full max-w-3xl rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="tax-receipts">
      <h2 className="font-display text-2xl">{copy.taxTitle}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{copy.taxLead}</p>
      <label className="mt-3 block max-w-xs text-sm">
        <span className="font-medium">{copy.taxYear}</span>
        <select
          className="ke-input mt-1 min-h-11 w-full"
          value={year ?? ""}
          onChange={(event) => setYear(Number(event.target.value))}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
        >
          {(years.length ? years : [year ?? new Date().getFullYear()]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {shown.length ? (
        <ul className="mt-4 space-y-3">
          {shown.map((group) => {
            const quebec = group.province === "QC";
            const ontario = group.province === "ON";
            const primaryKind = quebec ? "rl24" : "federal";
            const primaryLabel = quebec ? copy.taxDownloadRl24 : ontario ? copy.taxDownloadOntario : copy.taxDownloadFederal;
            return (
              <li key={`${group.daycareId}:${group.childId}:${group.parentUserId}`} className="rounded-xl bg-bg p-4 ring-1 ring-border">
                <p className="font-medium">
                  {copy.taxReceiptFor} {group.parentName}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {copy.taxCentre}: {group.daycareName}
                </p>
                <p className="text-sm text-muted">
                  {copy.taxChild}: {group.childName || copy.taxChildMissing}
                </p>
                <p className="mt-2 text-sm">
                  {copy.taxAmount}: {cadFromCents(group.amountCents)}
                </p>
                <p className="text-sm text-muted">
                  {copy.taxPeriod}: {group.periodStart} - {group.periodEnd}
                </p>
                <p className="text-sm text-muted">
                  {copy.taxBills}: {group.invoiceCount}
                  {group.daysOfCare != null ? ` · ${copy.taxDays}: ${group.daysOfCare}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy !== ""} onClick={() => download(group, primaryKind)}>
                    {primaryLabel}
                  </Button>
                  {quebec ? (
                    <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => download(group, "federal")}>
                      {copy.taxDownloadFederal}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{copy.taxEmpty}</p>
      )}
      <p className="mt-3 max-w-2xl text-sm text-muted">{copy.taxNote}</p>
      {note ? (
        <p className="mt-3 text-sm" role="status">
          {note}
        </p>
      ) : null}
      {desk === "centre" ? <div className="mt-3">{help}</div> : null}
    </section>
  );
}
