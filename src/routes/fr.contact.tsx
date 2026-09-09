import { createFileRoute } from "@tanstack/react-router";
import { Contact } from "@/routes/contact";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/contact")({
  validateSearch: (s: Record<string, unknown>) => {
    if (s.intent === "parent") return { intent: "parent" as const };
    return {};
  },
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.contact),
  component: Contact,
});
