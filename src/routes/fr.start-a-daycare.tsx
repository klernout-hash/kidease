import { createFileRoute } from "@tanstack/react-router";
import { StartADaycarePage } from "@/routes/start-a-daycare";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/start-a-daycare")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.startADaycare),
  component: StartADaycarePage,
});
