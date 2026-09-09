import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { COOKIES_EN, COOKIES_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/cookies")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.cookies),
  component: Cookies,
});

function Cookies() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? COOKIES_FR : COOKIES_EN} />;
}
