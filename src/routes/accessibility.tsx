import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { ACCESSIBILITY_EN, ACCESSIBILITY_FR } from "@/lib/legal-copy-v2";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/accessibility")({
  head: () => pageSeoHead({ title: "Accessibility · KidEase", description: "KidEase accessibility statement (WCAG 2.1 AA, AODA) and how to request alternate formats.", path: "/accessibility" }),
  component: Page,
});

function Page() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? ACCESSIBILITY_FR : ACCESSIBILITY_EN} />;
}
