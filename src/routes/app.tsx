import { createFileRoute, redirect } from "@tanstack/react-router";
import { GetAppScreen } from "@/routes/get-app";
import { storeForDevice } from "@/lib/app-stores";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const store = storeForDevice(request?.headers.get("user-agent"));
    if (store?.url) throw redirect({ href: store.url });
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
