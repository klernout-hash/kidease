import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EarningsHeader } from "@/components/earnings-header";
import { EarningsSheet } from "@/components/earnings-sheet";
import { EmptyState } from "@/components/empty-state";
import { downloadPdf } from "@/lib/earnings-pdf";
import type { EarningsResult, Statement } from "@/lib/earnings-desk";
import { sendEarningsStatement } from "@/lib/server/earnings-desk";
import { periodLabel } from "@/lib/stripe-methods";
import { formatPlanCad } from "@/lib/upgrade-plans";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";

export function EarningsStatementsScreen({ desk }: { desk: EarningsResult | null }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const statements = desk?.ok ? desk.statements : [];

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-28 pt-4" data-ke="earnings-statements">
      <EarningsHeader title={t("statementsTitle")} back={{ screen: "earnings" }} />
      <p className="mt-3 text-sm text-muted">{t("statementsLead")}</p>
      {!desk?.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}
      {desk?.ok && statements.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("statementsEmptyTitle")} body={t("statementsEmptyBody")} />
        </div>
      ) : null}
      {statements.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {statements.map((statement) => (
            <li key={statement.period} className="rounded-[1.25rem] bg-surface p-4 ring-1 ring-border" data-ke="statement-period">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{periodLabel(statement.period, french ? "fr" : "en")}</p>
                  <p className="mt-1 text-sm text-muted">
                    {statement.grossCents != null ? `${t("earningsGross")} ${cad(statement.grossCents)}` : ""}
                    {statement.grossCents != null && statement.netCents != null ? " · " : ""}
                    {statement.netCents != null ? `${t("earningsNet")} ${cad(statement.netCents)}` : ""}
                  </p>
                </div>
                {statement.isNew ? (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-fg">
                    {t("earningsNew")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/menu"
                  search={{ screen: "earnings", view: "statement", period: statement.period }}
                  className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {t("statementsOpen")}
                </Link>
                <button
                  type="button"
                  data-ke="statement-download"
                  className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => downloadPdf(`kidease-${statement.period}.pdf`, pdfLines(statement, cad, t))}
                >
                  {t("earningsDownloadPdf")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

export function EarningsStatementScreen({ desk, period }: { desk: EarningsResult | null; period?: string }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const statement = desk?.ok && period ? desk.statements.find((item) => item.period === period) ?? null : null;
  const [open, setOpen] = useState(false);
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-28 pt-4" data-ke="earnings-statement">
      <EarningsHeader title={statement ? periodLabel(statement.period, french ? "fr" : "en") : t("earningsStatement")} back={{ screen: "earnings" }} icon="close" />
      {!desk?.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}
      {desk?.ok && !statement ? (
        <div className="mt-6">
          <EmptyState title={t("statementsMissingTitle")} body={t("statementsEmptyBody")} />
        </div>
      ) : null}
      {statement ? (
        <>
          <section className="mt-5 rounded-[1.25rem] bg-surface-2 p-5">
            {statement.netCents != null ? <p className="font-display text-4xl tabular-nums">{cad(statement.netCents)}</p> : null}
            {statement.photos.length > 0 ? (
              <div className="mt-4 flex gap-2" data-ke="earnings-collage">
                {statement.photos.map((photo) => (
                  <img key={photo} src={photo} alt={t("earningsStatement")} width={72} height={72} className="size-16 rounded-xl object-cover" />
                ))}
              </div>
            ) : null}
          </section>
          <dl className="mt-5 space-y-3 text-sm" data-ke="earnings-summary">
            <Money label={t("earningsGross")} cents={statement.grossCents} cad={cad} />
            <Money label={t("earningsAdjustments")} cents={statement.adjustmentCents} cad={cad} />
            <Money label={t("earningsServiceFee")} cents={statement.feeCents == null ? null : -statement.feeCents} cad={cad} />
            <Money label={t("earningsTax")} cents={statement.taxCents} cad={cad} />
            <Money label={t("earningsNet")} cents={statement.netCents} cad={cad} />
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label={t("earningsDaysAttended")} value={statement.daysAttended} />
            <Stat label={t("earningsEnrolled")} value={statement.enrolledChildren} />
            <Stat label={t("insightsTours")} value={statement.tours} />
          </div>
          <Breakdown title={t("earningsByListing")} rows={statement.listings} cad={cad} />
          <Breakdown title={t("earningsByType")} rows={statement.types.map((row) => ({ ...row, name: row.id === "extra" ? t("earningsExtraFees") : t("earningsTuition") }))} cad={cad} />
          <Breakdown title={t("earningsByPayout")} rows={statement.payouts.map((row) => ({ ...row, name: t("earningsPayoutRef").replace("{id}", row.name) }))} cad={cad} />
          <Link
            to="/menu"
            search={{ screen: "earnings", view: "paid", period: statement.period }}
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          >
            {t("earningsMonthTx")}
          </Link>
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg border-t border-border bg-bg px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              data-ke="earnings-get-pdf"
              className="min-h-11 w-full rounded-full bg-fg text-sm font-semibold text-bg touch-manipulation"
              onClick={() => setOpen(true)}
            >
              {t("earningsGetPdf")}
            </button>
          </div>
          {open ? (
            <ReportSheet
              statement={statement}
              maskedEmail={desk?.ok ? desk.maskedEmail : null}
              cad={cad}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function ReportSheet({
  statement,
  maskedEmail,
  cad,
  onClose,
}: {
  statement: Statement;
  maskedEmail: string | null;
  cad: (cents: number) => string;
  onClose: () => void;
}) {
  const { t, locale } = useCopy();
  const [mode, setMode] = useState<"download" | "email">("download");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = pdfLines(statement, cad, t);
  return (
    <EarningsSheet title={t("earningsGetPdf")} onClose={onClose}>
      <fieldset className="mt-4 space-y-2" data-ke="earnings-pdf-choice">
        <legend className="sr-only">{t("earningsGetPdf")}</legend>
        <Choice name="report" checked={mode === "download"} onChange={() => setMode("download")} label={t("earningsDownloadPdf")} />
        <Choice
          name="report"
          checked={mode === "email"}
          onChange={() => setMode("email")}
          label={maskedEmail ? `${t("earningsSendEmail")} · ${maskedEmail}` : t("earningsSendEmail")}
        />
      </fieldset>
      {note ? (
        <p className="mt-3 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        data-ke="earnings-report-go"
        className="mt-5 min-h-11 w-full rounded-full bg-fg text-sm font-semibold text-bg touch-manipulation disabled:opacity-60"
        onClick={() => {
          if (mode === "download") {
            downloadPdf(`kidease-${statement.period}.pdf`, lines);
            return;
          }
          setBusy(true);
          void sendEarningsStatement({ data: { period: statement.period, locale: locale === "fr" ? "fr" : "en" } })
            .then((result) => {
              setNote(
                result.ok && result.maskedEmail
                  ? t("earningsEmailSent").replace("{email}", result.maskedEmail)
                  : t("earningsEmailFailed"),
              );
            })
            .catch(() => setNote(t("earningsEmailFailed")))
            .finally(() => setBusy(false));
        }}
      >
        {mode === "download" ? t("earningsDownload") : t("earningsSend")}
      </button>
    </EarningsSheet>
  );
}

function Choice({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4" />
      {label}
    </label>
  );
}

function Money({ label, cents, cad }: { label: string; cents: number | null; cad: (cents: number) => string }) {
  if (cents == null) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{cad(cents)}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <p className="rounded-[1.25rem] bg-surface p-4 ring-1 ring-border">
      <span className="block font-display text-2xl tabular-nums">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </p>
  );
}

function Breakdown({
  title,
  rows,
  cad,
}: {
  title: string;
  rows: Array<{ id: string; name: string; cents: number }>;
  cad: (cents: number) => string;
}) {
  if (!rows.length) return null;
  return (
    <section className="mt-6">
      <h2 className="font-medium">{title}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="tabular-nums">{cad(row.cents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function pdfLines(statement: Statement, cad: (cents: number) => string, t: (key: CopyKey) => string): string[] {
  const lines = [t("earningsStatement"), statement.period];
  if (statement.grossCents != null) lines.push(`${t("earningsGross")} ${cad(statement.grossCents)}`);
  if (statement.feeCents != null) lines.push(`${t("earningsServiceFee")} ${cad(-statement.feeCents)}`);
  if (statement.netCents != null) lines.push(`${t("earningsNet")} ${cad(statement.netCents)}`);
  return lines;
}
