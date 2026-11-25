import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { frAdminRedirectHref } from "@/lib/fr-admin-redirect";
import { LocalePathBoot } from "@/components/locale-path-boot";

export const Route = createFileRoute("/fr")({
  // /fr/admin-truth, /fr/admin-spam, … have no French route: send them to the English admin page.
  beforeLoad: ({ location }) => {
    const href = frAdminRedirectHref(location.pathname, location.searchStr);
    if (href) throw redirect({ href, replace: true });
  },
  component: FrLayout,
});

function FrLayout() {
  return (
    <>
      <LocalePathBoot locale="fr" />
      <Outlet />
    </>
  );
}
