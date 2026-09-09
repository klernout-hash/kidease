import { createFileRoute } from "@tanstack/react-router";
import { Help } from "@/routes/help";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/help")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.help),
  component: Help,
});
