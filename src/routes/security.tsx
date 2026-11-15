import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/security-page";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/security")({
  head: () =>
    pageSeoHead({
      title: "Security · KidEase",
      description: "How KidEase handles sign-in and child files. KidEase does not claim a security certification.",
      path: "/security",
    }),
  component: SecurityRoute,
});

function SecurityRoute() {
  const { locale } = useCopy();
  return <SecurityPage locale={locale === "fr" ? "fr" : "en"} />;
}
