import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { SMS_PRIVACY_FR, withSmsSection } from "@/lib/sms-legal";

export const Route = createFileRoute("/fr/privacy")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.privacy),
  component: FrPrivacy,
});

function FrPrivacy() {
  return <LegalPage doc={withSmsSection(PRIVACY_FR, SMS_PRIVACY_FR)} />;
}
