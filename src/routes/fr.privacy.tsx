import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/privacy")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.privacy),
  component: FrPrivacy,
});

function FrPrivacy() {
  return <LegalPage doc={PRIVACY_FR} />;
}
