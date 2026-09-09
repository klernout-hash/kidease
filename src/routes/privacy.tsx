import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_EN, PRIVACY_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/privacy")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.privacy),
  component: Privacy,
});

function Privacy() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? PRIVACY_FR : PRIVACY_EN} />;
}
