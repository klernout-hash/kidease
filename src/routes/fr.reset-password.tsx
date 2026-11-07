import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen, resetPasswordValidateSearch } from "@/routes/reset-password";
import { MARKETING_PAGE_SEO_FR, pageSeoHead, withNoindex } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/reset-password")({
  validateSearch: resetPasswordValidateSearch,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO_FR.resetPassword)),
  component: FrResetPassword,
});

function FrResetPassword() {
  const { token, from } = Route.useSearch();
  return <ResetPasswordScreen token={token} fromGov={from === "gov"} />;
}
