import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { GOV_TERMS_EN, GOV_TERMS_FR } from "@/lib/legal-copy-v2";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov-terms")({
  head: () => pageSeoHead({ title: "Government Portal Terms · KidEase", description: "Terms for licensing offices using the KidEase portal. KidEase is independent and not government-endorsed.", path: "/gov-terms" }),
  component: Page,
});

function Page() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? GOV_TERMS_FR : GOV_TERMS_EN} />;
}
