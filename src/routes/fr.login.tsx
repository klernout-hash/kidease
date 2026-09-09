import { createFileRoute } from "@tanstack/react-router";
import { loginLoader, loginValidateSearch, LoginScreen } from "@/routes/login";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/login")({
  validateSearch: loginValidateSearch,
  loader: loginLoader,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.login),
  component: FrLogin,
});

function FrLogin() {
  const { providers } = Route.useLoaderData();
  const search = Route.useSearch();
  return <LoginScreen providers={providers} search={search} />;
}
