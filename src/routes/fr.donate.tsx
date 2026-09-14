import { createFileRoute } from "@tanstack/react-router";
import { DonatePage } from "@/routes/donate";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/donate")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.donate),
  component: DonatePage,
});
