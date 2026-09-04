import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { PRIVACY_EN, PRIVACY_FR } from "@/lib/legal-copy";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy · KidEase" }, { name: "description", content: "KidEase privacy notice — PIPEDA, location, processors, and child safety." }],
  }),
  component: Privacy,
});

function Privacy() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? PRIVACY_FR : PRIVACY_EN} />;
}
