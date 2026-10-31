import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { listMyStripeInvoices, type StripeInvoiceView } from "@/lib/server/stripe-parent-invoices";
import { brandedInvoicePdf, invoicePdfFilename } from "@/lib/invoice-pdf";
import { formatInvoiceMoney } from "@/lib/stripe-parent-invoice";
import { isFrPath, localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

type Audience = "parent" | "daycare" | "all";

function saveInvoicePdf(invoice: StripeInvoiceView, locale: "en" | "fr") {
  if (invoice.invoicePdf?.startsWith("https://")) {
    window.open(invoice.invoicePdf, "_blank", "noopener,noreferrer");
    return;
  }
  const bytes = brandedInvoicePdf({
    id: invoice.id,
    number: invoice.number,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    status: invoice.status,
    paidAt: invoice.paidAt,
    daycareName: invoice.daycareName,
    locale,
  });
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const blob = new Blob([body], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = invoicePdfFilename(invoice.number);
  link.click();
  URL.revokeObjectURL(url);
}

export function StripeInvoiceList({
  audience,
  emphasizePay = false,
  asPage = false,
  initial,
}: {
  audience: Audience;
  emphasizePay?: boolean;
  asPage?: boolean;
  initial?: StripeInvoiceView[] | null;
}) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [rows, setRows] = useState<StripeInvoiceView[] | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const helpTo = isFrPath(pathname) ? "/fr/help" : "/help";
  const listTo = isFrPath(pathname) ? "/fr/invoices" : "/invoices";
  const detailTo = isFrPath(pathname) ? "/fr/invoices/$id" : "/invoices/$id";

  useEffect(() => {
    if (initial) return;
    let cancel = false;
    const slow = window.setTimeout(() => {
      if (!cancel) setFailed(true);
    }, 8000);
    void listMyStripeInvoices()
      .then((result) => {
        if (cancel) return;
        setRows(result.invoices);
        setFailed(false);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      })
      .finally(() => window.clearTimeout(slow));
    return () => {
      cancel = true;
      window.clearTimeout(slow);
    };
  }, [initial]);

  const invoices = (rows ?? []).filter((row) => {
    if (audience === "all") return true;
    return row.viewer === audience;
  });
  const daycare = audience === "daycare";
  const Title = asPage ? "h1" : "h2";
  let primaryUsed = false;

  return (
    <section className="space-y-4" data-ke="stripe-invoice-list">
      <div>
        <Title className={asPage ? "font-display text-3xl md:text-5xl" : "font-display text-2xl"}>{t("invoicesTitle")}</Title>
        <p className="mt-1 text-sm text-muted">{t(daycare ? "invoicesDaycareLead" : "invoicesLead")}</p>
        <p className="mt-1 text-sm text-muted">{t(daycare ? "invoicesDaycareNext" : "invoicesNext")}</p>
        <div className="no-print mt-3">
          <Button variant="secondary" asChild>
            <Link to={helpTo} data-ke="invoice-help">
              {t("invoiceHelp")}
            </Link>
          </Button>
        </div>
      </div>
      {failed && !rows ? (
        <EmptyState
          title={t("invoicesLoadError")}
          body={t("invoicesNext")}
          action={t("invoicesRetry")}
          onAction={() => {
            setFailed(false);
            setRows(null);
            void listMyStripeInvoices()
              .then((result) => setRows(result.invoices))
              .catch(() => setFailed(true));
          }}
          secondary={t("invoiceHelp")}
          secondaryTo={localePath("/help", locale)}
        />
      ) : null}
      {rows && invoices.length === 0 ? (
        <EmptyState
          title={t("invoicesEmptyTitle")}
          body={t(daycare ? "invoicesDaycareEmptyBody" : "invoicesEmptyBody")}
          action={t(daycare ? "invoicesDaycareEmptyAction" : "invoicesEmptyAction")}
          actionTo={daycare ? localePath("/provider", locale) : "/search"}
        />
      ) : null}
      {invoices.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {invoices.map((invoice) => {
            const money = formatInvoiceMoney(invoice.amountCents, invoice.currency, locale === "fr" ? "fr" : "en");
            const canPay = invoice.viewer !== "daycare" && invoice.status === "open" && Boolean(invoice.hostedInvoiceUrl);
            const primary = emphasizePay && canPay && !primaryUsed;
            if (primary) primaryUsed = true;
            return (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-ke="invoice-row" data-status={invoice.status}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={detailTo} params={{ id: invoice.id }} search={{}} className="font-medium underline-offset-4 hover:underline">
                      {invoice.number}
                    </Link>
                    <InvoiceBadge status={invoice.status} />
                  </div>
                  <p className="text-sm text-muted">
                    {invoice.daycareName || t("invoicesTitle")}
                    {money ? ` · ${money}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canPay && invoice.hostedInvoiceUrl ? (
                    <Button size="md" variant={primary ? "primary" : "secondary"} asChild>
                      <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                        {t("invoicePay")}
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="md"
                    variant="secondary"
                    type="button"
                    data-ke="invoice-pdf"
                    data-invoice={invoice.id}
                    onClick={() => saveInvoicePdf(invoice, locale === "fr" ? "fr" : "en")}
                  >
                    {t("invoiceDownloadPdf")}
                  </Button>
                  <Button size="md" variant="secondary" asChild>
                    <Link to={detailTo} params={{ id: invoice.id }} search={{ print: "1" }} data-ke="invoice-print">
                      {t("invoicePrint")}
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {audience !== "all" && invoices.length ? (
        <p className="text-sm">
          <Link to={listTo} className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("invoicesTitle")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function InvoiceBadge({ status }: { status: StripeInvoiceView["status"] }) {
  const { t } = useCopy();
  const label = status === "paid" ? t("invoiceStatusPaid") : status === "failed" ? t("invoiceStatusFailed") : t("invoiceStatusOpen");
  const tone =
    status === "paid"
      ? "bg-ok/10 text-ok ring-ok/20"
      : status === "failed"
        ? "bg-danger/10 text-danger ring-danger/20"
        : "bg-primary/10 text-primary ring-primary/20";
  return (
    <span data-ke="invoice-status" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

export function InvoiceDetail({ invoice }: { invoice: StripeInvoiceView }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const listTo = isFrPath(pathname) ? "/fr/invoices" : "/invoices";
  const helpTo = isFrPath(pathname) ? "/fr/help" : "/help";
  const money = formatInvoiceMoney(invoice.amountCents, invoice.currency, locale === "fr" ? "fr" : "en");
  const paid = invoice.status === "paid";
  const canPay = invoice.viewer !== "daycare" && invoice.status === "open" && Boolean(invoice.hostedInvoiceUrl);
  return (
    <article className="relative rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="invoice-detail">
      {paid ? (
        <p className="pointer-events-none absolute end-6 top-16 rotate-[-12deg] text-4xl font-black tracking-widest text-ok/70" data-ke="invoice-stamp">
          {t("invoiceStamp")}
        </p>
      ) : null}
      <p className="text-sm font-semibold text-primary">KidEase</p>
      <h1 className="mt-2 font-display text-3xl">{invoice.number}</h1>
      <p className="mt-2 text-sm text-muted">{t("invoicesLead")}</p>
      <p className="mt-1 text-sm text-muted">{paid ? t("invoicesDaycareNext") : t("invoicesNext")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <InvoiceBadge status={invoice.status} />
        {money ? <p className="font-display text-2xl tabular-nums">{money}</p> : null}
      </div>
      {invoice.daycareName ? <p className="mt-3 text-sm">{invoice.daycareName}</p> : null}
      {invoice.paidAt ? <p className="mt-1 text-sm text-muted">{invoice.paidAt.slice(0, 10)}</p> : null}
      <div className="no-print mt-5 flex flex-wrap gap-2">
        {canPay && invoice.hostedInvoiceUrl ? (
          <Button asChild>
            <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
              {t("invoicePay")}
            </a>
          </Button>
        ) : null}
        <Button variant="secondary" type="button" data-ke="invoice-pdf" onClick={() => saveInvoicePdf(invoice, locale === "fr" ? "fr" : "en")}>
          {t("invoiceDownloadPdf")}
        </Button>
        <Button
          variant="secondary"
          type="button"
          data-ke="invoice-print"
          onClick={() => window.print()}
        >
          {t("invoicePrint")}
        </Button>
        <Button variant="secondary" asChild>
          <Link to={helpTo} data-ke="invoice-help">
            {t("invoiceHelp")}
          </Link>
        </Button>
      </div>
      <p className="no-print mt-4 text-sm">
        <Link to={listTo} className="font-semibold text-primary underline-offset-4 hover:underline">
          {t("invoicesBack")}
        </Link>
      </p>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </article>
  );
}
