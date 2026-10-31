import { createFileRoute } from "@tanstack/react-router";
import { invoicePdfHttpResponse } from "@/lib/invoice-pdf";
import { loadInvoiceForDownload } from "@/lib/server/stripe-parent-invoices";

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
            invoicePdf: loaded.invoice.invoicePdf,
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
