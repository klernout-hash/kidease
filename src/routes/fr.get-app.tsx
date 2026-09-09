import { createFileRoute } from "@tanstack/react-router";
import { GetAppScreen, getAppValidateSearch } from "@/routes/get-app";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/get-app")({
  validateSearch: getAppValidateSearch,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.getApp),
  component: FrGetApp,
});

function FrGetApp() {
  const { dev } = Route.useSearch();
  return <GetAppScreen dev={dev} />;
}
