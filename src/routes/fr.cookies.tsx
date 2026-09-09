import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { COOKIES_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/cookies")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.cookies),
  component: FrCookies,
});

function FrCookies() {
  return <LegalPage doc={COOKIES_FR} />;
}
