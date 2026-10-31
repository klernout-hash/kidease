import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { InvoiceDetail } from "@/components/stripe-invoice-list";
import { EmptyState } from "@/components/empty-state";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { getMyStripeInvoice } from "@/lib/server/stripe-parent-invoices";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/invoices/$id")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  validateSearch: (search: Record<string, unknown>) => (search.print === "1" ? { print: "1" as const } : {}),
  loader: async ({ params }) => {
    try {
      return await getMyStripeInvoice({ data: params.id });
    } catch {
      return { invoice: null };
    }
  },
  head: () => ({
    meta: [
      { title: "Invoice · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { invoice } = Route.useLoaderData();
  const { print } = Route.useSearch();
  const { t } = useCopy();
  useEffect(() => {
    if (print === "1" && invoice) window.print();
  }, [print, invoice]);
  return invoice ? (
    <InvoiceDetail invoice={invoice} />
  ) : (
    <EmptyState
      title={t("invoicesMissing")}
      body={t("invoicesNext")}
      action={t("invoicesBack")}
      actionTo="/invoices"
      secondary={t("invoiceHelp")}
      secondaryTo="/help"
    />
  );
}
