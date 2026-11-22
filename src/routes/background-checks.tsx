import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { BackgroundCheckHub } from "@/components/background-check-guide-page";
import { backgroundCheckGuideEnabled } from "@/lib/features";
import { stripLocalePrefix } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/background-checks")({
  loader: () => ({ enabled: backgroundCheckGuideEnabled() }),
  head: ({ matches, loaderData }) => {
    const leaf = matches[matches.length - 1]?.routeId;
    if (leaf && leaf !== "/background-checks") return { meta: [] };
    if (!loaderData?.enabled) {
      return {
        meta: [
          { title: "Background checks · KidEase" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    }
    return pageSeoHead({
      title: "Background checks · KidEase",
      description:
        "Where to get the background checks a Canadian daycare role needs. KidEase does not run or verify the checks.",
      path: "/background-checks",
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
