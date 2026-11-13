import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { GOV_TERMS_EN, GOV_TERMS_FR } from "@/lib/legal-copy-v2";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov-terms")({
  beforeLoad: async ({ context }) => {
    const access = await guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell));
    if (access.nativeOnly) throw notFound();
  },
  head: () => govRobotsHead("Government Portal Terms · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});

function Page() {
  const { locale } = useCopy();
  return <LegalPage doc={locale === "fr" ? GOV_TERMS_FR : GOV_TERMS_EN} />;
}
