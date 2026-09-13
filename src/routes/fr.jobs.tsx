import { createFileRoute } from "@tanstack/react-router";
import { Jobs } from "@/routes/jobs";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/jobs")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.jobs),
  component: Jobs,
});
