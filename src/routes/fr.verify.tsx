import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { VerifyPage } from "@/routes/verify";

export const Route = createFileRoute("/fr/verify")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.verify),
  component: VerifyPage,
});
