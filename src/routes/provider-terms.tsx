import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PROVIDER_TERMS_EN, PROVIDER_TERMS_FR } from "@/lib/legal-copy-v2";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider-terms")({
  head: () => pageSeoHead({ title: "Provider Terms · KidEase", description: "KidEase terms for licensed centres and home daycares: claims, data, payouts, and chargebacks.", path: "/provider-terms" }),
  component: Page,
});

function Page() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? PROVIDER_TERMS_FR : PROVIDER_TERMS_EN} />;
}
