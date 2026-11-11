import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/security-page";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/trust")({
  component: TrustRoute,
});

function TrustRoute() {
  const { locale } = useCopy();
  return <SecurityPage locale={locale === "fr" ? "fr" : "en"} />;
}
