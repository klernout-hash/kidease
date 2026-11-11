import { createFileRoute, redirect } from "@tanstack/react-router";
import { GetAppScreen } from "@/routes/get-app";
import { appStoreHrefForRequest } from "@/lib/server/app-store-href";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const href = await appStoreHrefForRequest();
    if (href) throw redirect({ href });
  },
  head: () =>
    pageSeoHead({
      title: "Get the KidEase app",
      description: "Download KidEase from a store that is open.",
      path: "/app",
    }),
  component: AppLinkPage,
});

function AppLinkPage() {
  return <GetAppScreen />;
}
