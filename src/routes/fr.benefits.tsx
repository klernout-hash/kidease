import { createFileRoute } from "@tanstack/react-router";
import { BenefitsPage } from "@/routes/benefits";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/benefits")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.benefits),
  component: BenefitsPage,
});
