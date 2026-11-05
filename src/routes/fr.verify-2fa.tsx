import { createFileRoute } from "@tanstack/react-router";
import { VerifyTwoFactorScreen, verify2faValidateSearch } from "@/routes/verify-2fa";
import { MARKETING_PAGE_SEO_FR, pageSeoHead, withNoindex } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/verify-2fa")({
  validateSearch: verify2faValidateSearch,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO_FR.verify2fa)),
  component: FrVerifyTwoFactor,
});

function FrVerifyTwoFactor() {
  const { next } = Route.useSearch();
  return <VerifyTwoFactorScreen next={next} />;
}
