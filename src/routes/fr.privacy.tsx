import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { legalDocWithoutStorePurchase } from "@/lib/store-purchase-copy";
import { SMS_PRIVACY_FR, withSmsSection } from "@/lib/sms-legal";
import { useInNativeShell } from "@/lib/use-native-shell";

export const Route = createFileRoute("/fr/privacy")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.privacy),
  component: FrPrivacy,
});

function FrPrivacy() {
  const hideCommerce = useInNativeShell();
  const raw = withSmsSection(PRIVACY_FR, SMS_PRIVACY_FR);
  return <LegalPage doc={hideCommerce ? legalDocWithoutStorePurchase(raw) : raw} />;
}
