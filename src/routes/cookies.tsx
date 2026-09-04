import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { COOKIES_EN, COOKIES_FR } from "@/lib/legal-copy";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [{ title: "Cookies · KidEase" }, { name: "description", content: "KidEase cookie policy — essential storage only, no advertising trackers." }],
  }),
  component: Cookies,
});

function Cookies() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? COOKIES_FR : COOKIES_EN} />;
}
