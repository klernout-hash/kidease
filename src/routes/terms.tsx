import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_EN, TERMS_FR } from "@/lib/legal-copy";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms · KidEase" }, { name: "description", content: "KidEase terms of use for parents and licensed childcare centres." }],
  }),
  component: Terms,
});

function Terms() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? TERMS_FR : TERMS_EN} />;
}
