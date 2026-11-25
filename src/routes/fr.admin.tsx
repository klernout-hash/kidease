import { createFileRoute, redirect } from "@tanstack/react-router";
import { frAdminRedirectHref } from "@/lib/fr-admin-redirect";

// No French admin desk: /fr/admin* goes to the English admin page with the same path and query.
export const Route = createFileRoute("/fr/admin")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: frAdminRedirectHref(location.pathname, location.searchStr) ?? "/admin", replace: true });
  },
  head: () => ({
    meta: [{ title: "Admin · KidEase" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});
