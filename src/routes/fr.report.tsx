import { createFileRoute } from "@tanstack/react-router";
import { reportSearchProvince } from "@/lib/licensing-offices";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { ReportPage } from "@/routes/report";

export const Route = createFileRoute("/fr/report")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: reportSearchProvince(search.province),
  }),
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.report),
  component: ReportPage,
});
