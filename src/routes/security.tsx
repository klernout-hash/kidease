import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/security-page";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/security")({
  component: SecurityRoute,
});

function SecurityRoute() {
  const { locale } = useCopy();
  return <SecurityPage locale={locale === "fr" ? "fr" : "en"} />;
}
