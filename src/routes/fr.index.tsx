import { createFileRoute } from "@tanstack/react-router";
import { BootPending } from "@/components/boot-pending";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { HomePage, homeValidateSearch, loadProductHome } from "./index";

export const Route = createFileRoute("/fr/")({
  validateSearch: homeValidateSearch,
  loader: () => loadProductHome(),
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.home),
  component: FrProductHome,
});

function FrProductHome() {
  const boot = Route.useLoaderData();
  return <HomePage boot={boot} />;
}
