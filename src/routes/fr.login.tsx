import { createFileRoute } from "@tanstack/react-router";
import { loginGovBeforeLoad, loginLoader, loginValidateSearch, LoginScreen } from "@/routes/login";
import { MARKETING_PAGE_SEO_FR, pageSeoHead, withNoindex } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/login")({
  validateSearch: loginValidateSearch,
  beforeLoad: ({ search }) => loginGovBeforeLoad(search, "fr"),
  loader: loginLoader,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO_FR.login)),
  component: FrLogin,
});

function FrLogin() {
  const { providers, providersReady } = Route.useLoaderData();
  const search = Route.useSearch();
  return <LoginScreen providers={providers} providersReady={providersReady} search={search} />;
}
