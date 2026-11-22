import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { BackgroundCheckHub } from "@/components/background-check-guide-page";
import { backgroundCheckGuideEnabled } from "@/lib/features";
import { stripLocalePrefix } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/background-checks")({
  loader: () => ({ enabled: backgroundCheckGuideEnabled() }),
  head: ({ matches, loaderData }) => {
    const leaf = matches[matches.length - 1]?.routeId;
    if (leaf && leaf !== "/fr/background-checks") return { meta: [] };
    if (!loaderData?.enabled) {
      return {
        meta: [
          { title: "Vérifications d’antécédents · KidEase" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    }
    return pageSeoHead({
      title: "Vérifications d’antécédents · KidEase",
      description:
        "Où obtenir les vérifications exigées pour un rôle en garderie au Canada. KidEase ne fait pas ces vérifications et ne les confirme pas.",
      path: "/fr/background-checks",
    });
  },
  component: Page,
});

function Page() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname);
  const data = Route.useLoaderData();
  if (bare.startsWith("/background-checks/") && bare !== "/background-checks") return <Outlet />;
  return <BackgroundCheckHub enabled={data.enabled} />;
}
