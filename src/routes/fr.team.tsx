import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { Team } from "@/routes/team";

export const Route = createFileRoute("/fr/team")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.team),
  component: Team,
});
