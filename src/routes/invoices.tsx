import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { StripeInvoiceList } from "@/components/stripe-invoice-list";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { stripLocalePrefix } from "@/lib/locale-path";

export const Route = createFileRoute("/invoices")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => ({
    meta: [
      { title: "Invoices · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname);
  const detail = bare.startsWith("/invoices/");
  return (
    <Shell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        {detail ? <Outlet /> : <StripeInvoiceList audience="all" emphasizePay asPage />}
      </main>
    </Shell>
  );
}
