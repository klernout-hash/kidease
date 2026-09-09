import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_EN, TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.terms),
  component: Terms,
});

function Terms() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? TERMS_FR : TERMS_EN} />;
}
