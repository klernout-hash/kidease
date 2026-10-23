import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_EN, TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { SMS_TERMS_EN, SMS_TERMS_FR, withSmsSection } from "@/lib/sms-legal";
import { legalDocWithoutStorePurchase } from "@/lib/store-purchase-copy";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";

export const Route = createFileRoute("/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.terms),
  component: Terms,
});

function Terms() {
  const { locale } = useCopy();
  const hideCommerce = useInNativeShell();
  const raw =
    locale === "fr" ? withSmsSection(TERMS_FR, SMS_TERMS_FR) : withSmsSection(TERMS_EN, SMS_TERMS_EN);
  const doc = hideCommerce ? legalDocWithoutStorePurchase(raw) : raw;
  return <LegalPage doc={doc} />;
}
