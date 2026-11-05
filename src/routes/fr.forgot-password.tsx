import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordScreen, forgotPasswordLoader, forgotPasswordValidateSearch } from "@/routes/forgot-password";
import { MARKETING_PAGE_SEO_FR, pageSeoHead, withNoindex } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/forgot-password")({
  validateSearch: forgotPasswordValidateSearch,
  loader: forgotPasswordLoader,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO_FR.forgotPassword)),
  component: FrForgotPassword,
});

function FrForgotPassword() {
  const { mailReady } = Route.useLoaderData();
  const search = Route.useSearch();
  return <ForgotPasswordScreen mailReady={mailReady} initialEmail={search.email} />;
}
