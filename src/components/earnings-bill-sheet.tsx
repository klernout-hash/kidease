import { Landmark } from "lucide-react";
import { EarningsSheet } from "@/components/earnings-sheet";
import { formatEarnDate, statementLines, type EarnBill } from "@/lib/earnings-desk";
import { statementPdf } from "@/lib/earnings-pdf";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useCopy } from "@/lib/use-copy";

export function EarningsBillSheet({
  bill,
  audience,
  onClose,
}: {
  bill: EarnBill;
  audience: "centre" | "parent";
  onClose: () => void;
}) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const amount = audience === "parent" ? bill.grossCents : bill.netCents;
  const when = formatEarnDate(bill.paidAt || bill.dueAt || bill.payoutOn, french);
  const status =
    bill.status === "paid"
      ? bill.payoutRef
        ? `${t("earningsSent")} · ${t("earningsPayoutRef").replace("{id}", bill.payoutRef)}`
        : t("earningsSent")
      : when
        ? t("earningsSendingOn").replace("{date}", when)
        : t("earningsScheduled");
  return (
    <EarningsSheet title={bill.number ? t("earningsInvoiceNo").replace("{number}", bill.number) : t("earningsDetails")} onClose={onClose}>
      <div className="mt-2 flex items-center gap-3" data-ke="earnings-bill-sheet">
        <span className="grid size-11 place-items-center rounded-full bg-surface">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div>
          {amount != null ? <p className="font-display text-3xl tabular-nums">{cad(amount)}</p> : null}
          <p className="text-sm text-muted">{status}</p>
        </div>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        {bill.parentName ? <Row label={t("earningsDetails")} value={bill.parentName} /> : null}
        {bill.programStart ? <Row label={t("earningsProgram")} value={formatEarnDate(bill.programStart, french) || bill.programStart} /> : null}
        {bill.centreName ? <Row label={t("earningsByListing")} value={bill.centreName} /> : null}
      </dl>
      {bill.lines.length > 0 ? (
        <ul className="mt-5 divide-y divide-border border-y border-border" data-ke="earnings-lines">
          {bill.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 py-3">
              <span>{line.label || t(line.kind === "fee" ? "earningsServiceFee" : line.kind === "extra" ? "earningsExtraFees" : "earningsTuition")}</span>
              <span className="tabular-nums">{cad(line.cents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {audience === "centre" && bill.netCents != null ? (
        <p className="mt-4 flex items-center justify-between font-semibold">
          <span>{t("earningsNet")}</span>
          <span className="tabular-nums">{cad(bill.netCents)}</span>
        </p>
      ) : null}
      {audience === "parent" ? (
        <div className="mt-5 flex flex-col gap-2">
          {bill.receiptUrl ? (
            <a
              href={bill.receiptUrl}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-fg px-4 text-sm font-semibold"
              data-ke="earnings-receipt"
            >
              {t("earningsReceipt")}
            </a>
          ) : null}
          <button
            type="button"
            className="min-h-11 rounded-full bg-fg px-4 text-sm font-semibold text-bg touch-manipulation"
            data-ke="earnings-download-pdf"
            onClick={() => downloadPdf(bill, cad, t("earningsReceipt"))}
          >
            {t("earningsDownloadPdf")}
          </button>
        </div>
      ) : null}
    </EarningsSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  );
}

function downloadPdf(bill: EarnBill, cad: (cents: number) => string, title: string) {
  const bytes = statementPdf(statementLines(bill, cad, title));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${bill.number || "receipt"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
