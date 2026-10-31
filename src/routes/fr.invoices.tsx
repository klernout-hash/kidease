import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { StripeInvoiceList } from "@/components/stripe-invoice-list";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { stripLocalePrefix } from "@/lib/locale-path";

export const Route = createFileRoute("/fr/invoices")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => ({
    meta: [
      { title: "Factures · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FrenchInvoicesPage,
});

function FrenchInvoicesPage() {
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
