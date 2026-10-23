import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { legalDocWithoutStorePurchase } from "@/lib/store-purchase-copy";
import { SMS_TERMS_FR, withSmsSection } from "@/lib/sms-legal";
import { useInNativeShell } from "@/lib/use-native-shell";

export const Route = createFileRoute("/fr/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.terms),
  component: FrTerms,
});

function FrTerms() {
  const hideCommerce = useInNativeShell();
  const raw = withSmsSection(TERMS_FR, SMS_TERMS_FR);
  return <LegalPage doc={hideCommerce ? legalDocWithoutStorePurchase(raw) : raw} />;
}
