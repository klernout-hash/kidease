import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { DaycareRequirementsPage } from "@/routes/daycare-requirements";

export const Route = createFileRoute("/fr/daycare-requirements")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.daycareRequirements),
  component: DaycareRequirementsPage,
});
