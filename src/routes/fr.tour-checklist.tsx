import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { TourChecklist } from "@/routes/tour-checklist";

export const Route = createFileRoute("/fr/tour-checklist")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.tourChecklist),
  component: TourChecklist,
});
