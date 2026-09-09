import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "@/routes/faq";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/faq")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.faq),
  component: FaqPage,
});
