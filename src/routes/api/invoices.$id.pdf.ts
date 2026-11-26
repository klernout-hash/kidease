import { createFileRoute } from "@tanstack/react-router";
import { invoicePdfHttpResponse } from "@/lib/invoice-pdf";
import { loadInvoiceForDownload } from "@/lib/server/stripe-parent-invoices";

/** ?lang=fr, a /fr/ referrer, or a French Accept-Language picks the French PDF. */
function pdfLocale(request: Request): "en" | "fr" {
  const url = new URL(request.url);
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (lang === "fr") return "fr";
  if (lang === "en") return "en";
  try {
    const ref = request.headers.get("referer");
    if (ref && /^\/fr(\/|$)/.test(new URL(ref).pathname)) return "fr";
  } catch {
    /* ignore */
  }
  return /^fr\b/i.test(request.headers.get("accept-language") || "") ? "fr" : "en";
}

async function run(request: Request, invoiceId: string) {
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const header = request.headers.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(\S+)/i)?.[1];
  let userId: string;
  try {
    userId = await requireUserId(bearer);
  } catch {
    return invoicePdfHttpResponse({ invoice: null, authorized: false });
  }
  try {
    const loaded = await loadInvoiceForDownload(userId, invoiceId);
    return invoicePdfHttpResponse({
      invoice: loaded.invoice
        ? {
            id: loaded.invoice.id,
            number: loaded.invoice.number,
            amountCents: loaded.invoice.amountCents,
            currency: loaded.invoice.currency,
            status: loaded.invoice.status,
            paidAt: loaded.invoice.paidAt,
            daycareName: loaded.invoice.daycareName,
            daycareAddress: loaded.invoice.daycareAddress ?? null,
            invoicePdf: loaded.invoice.invoicePdf,
            locale: pdfLocale(request),
          }
        : null,
      authorized: loaded.authorized,
    });
  } catch {
    return invoicePdfHttpResponse({ invoice: null, authorized: true });
  }
}

export const Route = createFileRoute("/api/invoices/$id/pdf")({
  server: {
    handlers: {
      GET: ({ request, params }) => run(request, params.id),
    },
  },
});
