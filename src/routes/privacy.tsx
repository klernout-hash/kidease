import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_EN, PRIVACY_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { SMS_PRIVACY_EN, SMS_PRIVACY_FR, withSmsSection } from "@/lib/sms-legal";
import { legalDocWithoutStorePurchase } from "@/lib/store-purchase-copy";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";

export const Route = createFileRoute("/privacy")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.privacy),
  component: Privacy,
});

function Privacy() {
  const { locale } = useCopy();
  const hideCommerce = useInNativeShell();
  const raw =
    locale === "fr"
      ? withSmsSection(PRIVACY_FR, SMS_PRIVACY_FR)
      : withSmsSection(PRIVACY_EN, SMS_PRIVACY_EN);
  const doc = hideCommerce ? legalDocWithoutStorePurchase(raw) : raw;
  return <LegalPage doc={doc} />;
}
