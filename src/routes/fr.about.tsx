import { createFileRoute } from "@tanstack/react-router";
import { About } from "@/routes/about";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/about")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.about),
  component: About,
});
